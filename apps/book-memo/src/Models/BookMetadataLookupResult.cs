namespace MyPortal.BookMemo.Models;

public sealed record BookMetadataLookupResult
{
    public required string Isbn { get; init; }

    public string? Title { get; init; }

    public IReadOnlyList<string>? Authors { get; init; }

    public string? Publisher { get; init; }

    public DateOnly? PublishedOn { get; init; }

    public string? CoverImageUrl { get; init; }

    public string? Description { get; init; }
}
