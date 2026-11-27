/// An in-place AI improvement job.
///
/// The mobile flow matches Resumonk and the web builder: grant → enqueue →
/// poll → apply the returned structured document with an undo step.
class DocumentImprovementJob {
  const DocumentImprovementJob({
    required this.id,
    required this.status,
    this.error,
    this.resumeData,
  });

  final String id;
  final String status;
  final String? error;

  /// The improved structured document, present only on `success`.
  final Map<String, dynamic>? resumeData;

  bool get isPending =>
      status == 'granted' || status == 'pending' || status == 'processing';

  factory DocumentImprovementJob.fromJson(Map<String, dynamic> json) {
    final result = json['result'];
    Map<String, dynamic>? resumeData;
    if (result is Map) {
      final resume = result['resume'];
      if (resume is Map) resumeData = Map<String, dynamic>.from(resume);
    }
    return DocumentImprovementJob(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'failed',
      error: json['error']?.toString(),
      resumeData: resumeData,
    );
  }
}
