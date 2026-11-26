import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_media.dart';
import 'app_background.dart';
import 'brand_mark.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _mainController;
  late final AnimationController _pulseController;

  late final Animation<double> _logoScaleAnimation;
  late final Animation<double> _logoFadeAnimation;
  late final Animation<double> _wordmarkSlideAnimation;
  late final Animation<double> _wordmarkFadeAnimation;

  @override
  void initState() {
    super.initState();
    _mainController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    )..repeat();

    _logoScaleAnimation = Tween<double>(begin: 0.4, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.0, 0.6, curve: Curves.elasticOut),
      ),
    );

    _logoFadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.0, 0.4, curve: Curves.easeIn),
      ),
    );

    _wordmarkSlideAnimation = Tween<double>(begin: 30.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.4, 0.8, curve: Curves.easeOutCubic),
      ),
    );

    _wordmarkFadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.4, 0.8, curve: Curves.easeIn),
      ),
    );

    _mainController.forward();

    Future.delayed(const Duration(milliseconds: 2400), () {
      if (mounted) {
        widget.onFinished();
      }
    });
  }

  @override
  void dispose() {
    _mainController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final app = context.appColors;
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      body: AppBackground(
        imageUrl: AppMedia.heroAbstract,
        videoUrl: AppMedia.radarLoop,
        imageOpacity: isDark ? 0.16 : 0.08,
        videoOpacity: isDark ? 0.22 : 0.14,
        topScrim: isDark ? 0.12 : 0.02,
        bottomScrim: isDark ? 0.28 : 0.1,
        child: Stack(
          alignment: Alignment.center,
          children: [
            AnimatedBuilder(
              animation: _pulseController,
              builder: (context, child) {
                return CustomPaint(
                  painter: RadarPulsePainter(
                    progress: _pulseController.value,
                    color: app.insight,
                  ),
                  size: const Size(double.infinity, double.infinity),
                );
              },
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FadeTransition(
                  opacity: _logoFadeAnimation,
                  child: ScaleTransition(
                    scale: _logoScaleAnimation,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            scheme.surfaceContainerLow.withValues(alpha: 0.96),
                            scheme.surfaceContainerHigh.withValues(alpha: 0.92),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(36),
                        border: Border.all(
                          color: scheme.outlineVariant.withValues(alpha: 0.4),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: app.insight.withValues(alpha: 0.22),
                            blurRadius: 36,
                            offset: const Offset(0, 14),
                          ),
                        ],
                      ),
                      child: const Padding(
                        padding: EdgeInsets.all(24),
                        child: BrandMark(size: 72, showWordmark: false),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
                AnimatedBuilder(
                  animation: _mainController,
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(0, _wordmarkSlideAnimation.value),
                      child: FadeTransition(
                        opacity: _wordmarkFadeAnimation,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const BrandMark(size: 34, showWordmark: true),
                            const SizedBox(height: 12),
                            Text(
                              'AI-Powered Career Intelligence',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurfaceVariant,
                                letterSpacing: 0.6,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
            Positioned(
              bottom: 48,
              left: 0,
              right: 0,
              child: FadeTransition(
                opacity: _wordmarkFadeAnimation,
                child: Column(
                  children: [
                    SizedBox(
                      width: 96,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          minHeight: 4,
                          backgroundColor: scheme.surfaceContainerHighest,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            app.insight,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Preparing your workspace...',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RadarPulsePainter extends CustomPainter {
  RadarPulsePainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width > size.height
        ? size.width / 2
        : size.height / 2;

    for (int i = 0; i < 3; i++) {
      final ringProgress = (progress + (i * 0.33)) % 1.0;
      final radius = maxRadius * ringProgress * 0.85;
      final opacity = (1.0 - ringProgress).clamp(0.0, 1.0) * 0.25;

      final paint = Paint()
        ..color = color.withValues(alpha: opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;

      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant RadarPulsePainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.color != color;
  }
}
