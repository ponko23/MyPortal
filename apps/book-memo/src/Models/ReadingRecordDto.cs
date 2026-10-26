namespace MyPortal.BookMemo.Models;

public sealed record ReadingRecordDto
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required Guid BookMetadataId { get; init; }

    public required DateOnly RegisteredOn { get; init; }

    public DateOnly? BorrowedOn { get; init; }

    public DateOnly? PurchasedOn { get; init; }

    public bool? IsPurchaseCandidate { get; init; }

    public ReadingStatus ReadingStatus { get; init; } = ReadingStatus.Unread;

    public DateOnly? ReadOn { get; init; }

    public string? Memo { get; init; }

    public string? UnreadReason { get; init; }
}
