import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/document_version.dart';
import 'document_controller.dart';

/// Version list with compare and restore for a generated document.
class DocumentVersionHistory extends StatefulWidget {
  const DocumentVersionHistory({super.key, required this.documentId});

  final String documentId;

  @override
  State<DocumentVersionHistory> createState() => _DocumentVersionHistoryState();
}

class _DocumentVersionHistoryState extends State<DocumentVersionHistory> {
  late Future<List<DocumentVersion>> _versions;
  DocumentVersion? _comparisonBase;

  @override
  void initState() {
    super.initState();
    _versions = context.read<DocumentController>().versions(widget.documentId);
  }

  Future<void> _reload() async {
    final request = context.read<DocumentController>().versions(
      widget.documentId,
    );
    setState(() => _versions = request);
    await request;
  }

  Future<void> _restore(DocumentVersion version) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Restore this version?'),
        content: Text(
          'Version ${version.version} will become the current document. '
          'Your other versions stay in history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Restore'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;
    await context.read<DocumentController>().restoreVersion(
      widget.documentId,
      version,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Version restored and saved.')),
    );
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DocumentVersion>>(
      future: _versions,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SectionCard(child: LinearProgressIndicator());
        }
        if (snapshot.hasError) {
          return SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Version history is unavailable offline.'),
                const SizedBox(height: 8),
                TextButton(onPressed: _reload, child: const Text('Try again')),
              ],
            ),
          );
        }
        final items = snapshot.data ?? const <DocumentVersion>[];
        if (items.isEmpty) {
          return const SectionCard(child: Text('No previous versions yet.'));
        }
        return SectionCard(
          child: Semantics(
            label: 'Document version history, ${items.length} versions',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Version history',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Reload version history',

                      onPressed: _reload,
                      icon: const Icon(Icons.refresh_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                if (_comparisonBase != null)
                  Text(
                    'Comparing from v${_comparisonBase!.version}. '
                    'Choose another version to see the diff.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                for (final version in items)
                  Semantics(
                    label:
                        'Version ${version.version}, '
                        '${AppFormatters.dateTime(version.createdAt)}',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(child: Text('${version.version}')),
                      title: Text(
                        version.title.isEmpty
                            ? 'Version ${version.version}'
                            : version.title,
                      ),
                      subtitle: Text(
                        '${AppFormatters.dateTime(version.createdAt)}'
                        '${version.author.isEmpty ? '' : ' · ${version.author}'}',
                      ),
                      trailing: PopupMenuButton<String>(
                        tooltip: 'Version actions',
                        onSelected: (value) {
                          if (value == 'compare') {
                            setState(() => _comparisonBase = version);
                          } else if (value == 'restore') {
                            _restore(version);
                          }
                        },
                        itemBuilder: (context) => const [
                          PopupMenuItem(
                            value: 'compare',
                            child: Text('Compare with this'),
                          ),
                          PopupMenuItem(
                            value: 'restore',
                            child: Text('Restore'),
                          ),
                        ],
                      ),
                      onTap: () {
                        final base = _comparisonBase;
                        if (base == null) {
                          setState(() => _comparisonBase = version);
                          return;
                        }
                        if (base.version == version.version) return;
                        showDialog<void>(
                          context: context,
                          builder: (context) => AlertDialog(
                            title: Text(
                              'v${base.version} → v${version.version}',
                            ),
                            content: SingleChildScrollView(
                              child: Text(
                                DocumentVersionDiff(base, version).addedLines >
                                        DocumentVersionDiff(
                                          base,
                                          version,
                                        ).removedLines
                                    ? '${DocumentVersionDiff(base, version).addedLines} lines added, '
                                          '${DocumentVersionDiff(base, version).removedLines} lines changed or removed.'
                                    : '${DocumentVersionDiff(base, version).removedLines} lines changed or removed, '
                                          '${DocumentVersionDiff(base, version).addedLines} lines added.',
                              ),
                            ),
                            actions: [
                              FilledButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('Close'),
                              ),
                            ],
                          ),
                        );
                        setState(() => _comparisonBase = null);
                      },
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
