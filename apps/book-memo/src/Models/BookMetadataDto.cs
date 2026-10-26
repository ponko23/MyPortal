namespace MyPortal.BookMemo.Models;

public sealed record BookMetadataDto
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string? Isbn { get; init; }

    public required string Title { get; init; }

    public IReadOnlyList<string> Authors { get; init; } = [];

    public string? Publisher { get; init; }

    public DateOnly? PublishedOn { get; init; }

    public string? CoverImageUrl { get; init; }

    public string? Description { get; init; }
}
