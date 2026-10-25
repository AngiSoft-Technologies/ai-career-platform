import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/generated_document.dart';
import 'document_controller.dart';

class DocumentListScreen extends StatefulWidget {
  const DocumentListScreen({super.key});

  @override
  State<DocumentListScreen> createState() => _DocumentListScreenState();
}

class _DocumentListScreenState extends State<DocumentListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DocumentController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<DocumentController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Documents'),
        actions: [
          IconButton(
            tooltip: 'Refresh documents',
            onPressed: controller.load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: switch (controller.state) {
        DocumentLoadState.idle || DocumentLoadState.loading =>
          const LoadingState(label: 'Loading documents…'),
        DocumentLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load documents',
          onRetry: controller.load,
        ),
        DocumentLoadState.ready =>
          controller.items.isEmpty
              ? const EmptyState(
                  title: 'No generated documents',
                  message: 'Generate a CV or cover letter from an application workspace.',
                  icon: Icons.description_outlined,
                )
              : RefreshIndicator(
                  onRefresh: controller.load,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: controller.items.length,
                    separatorBuilder: (_, index) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final document = controller.items[index];
                      return _DocumentCard(
                        document: document,
                        onTap: () => context.push('/documents/${document.id}'),
                      );
                    },
                  ),
                ),
      },
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.document, required this.onTap});

  final GeneratedDocument document;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
          child: Icon(
            document.type == 'cv'
                ? Icons.badge_outlined
                : Icons.edit_note_rounded,
          ),
        ),
        title: Text(
          document.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(document.typeLabel),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
