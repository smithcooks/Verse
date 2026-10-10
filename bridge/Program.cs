using System.Text;
using System.Text.Json;
using Windows.Media.Control;
using Windows.Storage.Streams;

Console.OutputEncoding = new UTF8Encoding(false);
string selected = "";
_ = Task.Run(() => {
    string? line;
    while ((line = Console.ReadLine()) != null) {
        try {
            using var command = JsonDocument.Parse(line);
            if (command.RootElement.TryGetProperty("source", out var source))
                Volatile.Write(ref selected, source.GetString() ?? "");
        } catch (JsonException) { }
    }
});

void Send(object value) => Console.WriteLine(JsonSerializer.Serialize(value));
string artworkKey = "";
string? artwork = null;
GlobalSystemMediaTransportControlsSessionManager? manager = null;
while (true) {
    try {
        manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        var sessions = manager.GetSessions();
        var chosen = Volatile.Read(ref selected);
        var session = chosen.Length == 0 ? manager.GetCurrentSession()
            : sessions.FirstOrDefault(s => s.SourceAppUserModelId == chosen);
        var sources = sessions.Select(s => s.SourceAppUserModelId).Distinct().ToArray();
        if (session == null) {
            Send(new { sources, track = (object?)null });
        } else {
            var media = await session.TryGetMediaPropertiesAsync();
            var timeline = session.GetTimelineProperties();
            var playback = session.GetPlaybackInfo();
            bool playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            double duration = (timeline.EndTime - timeline.StartTime).TotalSeconds;
            double position = (timeline.Position - timeline.StartTime).TotalSeconds;
            var now = DateTimeOffset.UtcNow;
            if (playing && timeline.LastUpdatedTime.Year > 2000)
                position += Math.Max(0, (now - timeline.LastUpdatedTime).TotalSeconds) * (playback.PlaybackRate ?? 1);
            position = Math.Max(0, duration > 0 ? Math.Min(duration, position) : position);
            var key = $"{session.SourceAppUserModelId}|{media.Title}|{media.Artist}|{media.AlbumTitle}";
            if (artworkKey != key) {
                artworkKey = key;
                artwork = null;
                if (media.Thumbnail != null) {
                    try {
                        using var stream = await media.Thumbnail.OpenReadAsync();
                        if (stream.Size > 0 && stream.Size < 2_000_000) {
                            using var reader = new DataReader(stream);
                            await reader.LoadAsync((uint)stream.Size);
                            var bytes = new byte[(int)stream.Size];
                            reader.ReadBytes(bytes);
                            var mime = stream.ContentType;
                            if (mime.StartsWith("image/")) artwork = $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
                        }
                    } catch { /* Artwork failure must not stop playback tracking. */ }
                }
            }
            Send(new {
                sources,
                track = new {
                    source = session.SourceAppUserModelId, title = media.Title, artist = media.Artist,
                    album = media.AlbumTitle, duration, position, playing,
                    rate = playback.PlaybackRate ?? 1, sampledAt = now.ToUnixTimeMilliseconds(),
                    timelineAvailable = duration > 0, artwork
                }
            });
        }
    } catch (Exception error) {
        manager = null;
        Send(new { sources = Array.Empty<string>(), track = (object?)null, error = error.Message });
    }
    await Task.Delay(500);
}
