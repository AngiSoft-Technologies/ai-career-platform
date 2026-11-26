/// A stored revision of a generated document.
class DocumentVersion {
  const DocumentVersion({
    required this.id,
    required this.documentId,
    required this.version,
    required this.content,
    this.title = '',
    this.createdAt,
    this.author = '',
  });

  final String id;
  final String documentId;
  final int version;
  final String content;
  final String title;
  final DateTime? createdAt;
  final String author;

  factory DocumentVersion.fromJson(Map<String, dynamic> json) =>
      DocumentVersion(
        id: (json['id'] ?? json['versionId'])?.toString() ?? '',
        documentId: json['documentId']?.toString() ?? '',
        version: (json['version'] as num?)?.toInt() ?? 0,
        content: json['content']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
        author: json['author']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'documentId': documentId,
    'version': version,
    'content': content,
    'title': title,
    if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
    'author': author,
  };
}

/// Side-by-side comparison of two revisions, with changed-line counts kept
/// local so compare works without a network round trip.
class DocumentVersionDiff {
  const DocumentVersionDiff(this.before, this.after);

  final DocumentVersion before;
  final DocumentVersion after;

  int get addedLines => _changedLines(after, before);
  int get removedLines => _changedLines(before, after);

  static int _changedLines(DocumentVersion source, DocumentVersion other) {
    final otherLines = other.content.split(RegExp(r'\r?\n')).toSet();
    return source.content
        .split(RegExp(r'\r?\n'))
        .where((line) => line.trim().isNotEmpty && !otherLines.contains(line))
        .length;
  }
}
