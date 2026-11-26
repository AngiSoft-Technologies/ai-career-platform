/// CDN media used by the mobile app.
/// Keep URLs centralized so backgrounds/imagery can be changed without hunting.
class AppMedia {
  const AppMedia._();

  static const cdnBase = 'https://cdn1.angisoft.co.ke/mboqara';

  // Backgrounds / hero imagery
  static const heroCareer =
      '$cdnBase/images/mboqara/careers/technology-professional.webp';
  static const heroTeam =
      '$cdnBase/images/mboqara/careers/team-collaboration.webp';
  static const heroOffice =
      '$cdnBase/images/mboqara/careers/modern-office.webp';
  static const heroInterview =
      '$cdnBase/images/mboqara/careers/interview.webp';
  static const heroAbstract =
      '$cdnBase/images/mboqara/bg-about.jpg';
  static const radarPoster =
      '$cdnBase/images/mboqara/radar-poster.jpg';
  static const radarLoop =
      '$cdnBase/images/mboqara/radar-loop.mp4';

  // Brand
  static const logoMark = 'assets/branding/logo_mark.png';
  static const wordmarkDark = 'assets/branding/logo_wordmark.png';
  static const wordmarkLight = 'assets/branding/logo_wordmark_light.png';
}
