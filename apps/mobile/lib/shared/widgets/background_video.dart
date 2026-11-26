import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';


/// Muted, looping background video for hero surfaces.
/// Falls back to [fallback] when video can't initialize (common on emulators,
/// low data, or unsupported codecs). Kept subtle via overlay/scrim.
class BackgroundVideo extends StatefulWidget {
  const BackgroundVideo({
    super.key,
    required this.videoUrl,
    this.fallback,
    this.overlayOpacity,
  });

  final String videoUrl;
  final Widget? fallback;
  final double? overlayOpacity;

  @override
  State<BackgroundVideo> createState() => _BackgroundVideoState();
}

class _BackgroundVideoState extends State<BackgroundVideo> {
  VideoPlayerController? _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // Avoid background video on web debug quirks; mobile APK is target.
    try {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.videoUrl),
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );
      _controller = controller;
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(0);
      await controller.play();
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      debugPrint('BackgroundVideo unavailable: $e');
      if (mounted) setState(() => _ready = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final overlay = widget.overlayOpacity ?? (isDark ? 0.58 : 0.46);
    final controller = _controller;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_ready && controller != null && controller.value.isInitialized)
          FittedBox(
            fit: BoxFit.cover,
            clipBehavior: Clip.hardEdge,
            child: SizedBox(
              width: controller.value.size.width,
              height: controller.value.size.height,
              child: VideoPlayer(controller),
            ),
          )
        else
          widget.fallback ?? ColoredBox(color: scheme.surface),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                scheme.surface.withValues(alpha: overlay * 0.55),
                scheme.surface.withValues(alpha: overlay),
                scheme.surface.withValues(alpha: overlay * 0.92),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
