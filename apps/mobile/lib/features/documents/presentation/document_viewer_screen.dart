import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/app_background.dart';
import '../domain/generated_document.dart';
import 'document_controller.dart';
import 'document_version_history.dart';
import 'document_workflow_panel.dart';

class DocumentViewerScreen extends StatefulWidget {
  const DocumentViewerScreen({super.key, required this.documentId});

  final String documentId;

  @override
  State<DocumentViewerScreen> createState() => _DocumentViewerScreenState();
}

class _DocumentViewerScreenState extends State<DocumentViewerScreen> {
  late Future<GeneratedDocument?> _document;

  @override
  void initState() {
    super.initState();
    _document = context.read<DocumentController>().getDocument(
      widget.documentId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Document'),
        actions: [
          IconButton(
            tooltip: 'Version history',

            onPressed: () async {
              final document = await _document;
              if (document == null || !context.mounted) return;
              await showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                builder: (context) => DraggableScrollableSheet(
                  expand: false,
                  initialChildSize: 0.8,
                  builder: (context, scrollController) => SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    child: DocumentVersionHistory(documentId: document.id),
                  ),
                ),
              );
            },
            icon: const Icon(Icons.history_rounded),
          ),
          IconButton(
            tooltip: 'Copy document',

            onPressed: () async {
              final document = await _document;
              if (document != null) {
                await Clipboard.setData(ClipboardData(text: document.content));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Document copied.')),
                );
              }
            },
            icon: const Icon(Icons.copy_rounded),
          ),
        ],
      ),
      body: AppBackground(
        child: FutureBuilder<GeneratedDocument?>(
          future: _document,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const LoadingState(label: 'Opening document…');
            }
            final document = snapshot.data;
            if (document == null) {
              return const ErrorState(
                message: 'This document is not available on the device.',
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                Text(
                  document.title,
                  style: Theme.of(context).textTheme.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  document.typeLabel,
                  style: Theme.of(context).textTheme.labelLarge
                      ?.copyWith(color: Theme.of(context).colorScheme.primary),
                ),
                const SizedBox(height: 22),
                SelectableText(
                  document.content,
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(height: 1.55),
                ),
                const SizedBox(height: 24),
                DocumentWorkflowPanel(document: document),
                const SizedBox(height: 14),
                DocumentVersionHistory(documentId: document.id),
              ],
            );
          },
        ),
      ),
    );
  }
}
