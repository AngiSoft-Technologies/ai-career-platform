import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/generated_document.dart';
import 'document_controller.dart';

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
      appBar: AppBar(
        title: const Text('Document'),
        actions: [
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
      body: FutureBuilder<GeneratedDocument?>(
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
            ],
          );
        },
      ),
    );
  }
}
