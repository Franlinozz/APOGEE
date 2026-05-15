/* eslint-disable @next/next/no-img-element -- SVG brand assets are served directly from /public to avoid Next Image SVG friction. */

type LogoVariant = 'auto' | 'light' | 'dark';
type LogoMode = 'nav' | 'sidebar' | 'auth' | 'footer' | 'mark';

type ApogeeLogoProps = {
  variant?: LogoVariant;
  mode?: LogoMode;
  markOnly?: boolean;
  className?: string;
  priority?: boolean;
};

const ASSETS = {
  logo: {
    light: '/brand/apogee-logo-light.svg',
    dark: '/brand/apogee-logo-dark.svg',
  },
  mark: {
    light: '/brand/apogee-mark-light.svg',
    dark: '/brand/apogee-mark-dark.svg',
  },
} as const;

const MODE_CLASS: Record<LogoMode, string> = {
  nav: 'h-14 w-[112px] max-w-[120px]',
  sidebar: 'h-16 w-[104px] max-w-[110px]',
  auth: 'h-9 w-14 max-w-[3.5rem]',
  footer: 'h-24 w-full max-w-[200px] sm:max-w-[280px] lg:max-w-[360px]',
  mark: 'h-9 w-14 max-w-[3.5rem]',
};

function srcFor(variant: 'light' | 'dark', markOnly: boolean): string {
  return ASSETS[markOnly ? 'mark' : 'logo'][variant];
}

function imageClass(themeClass?: string): string {
  return [
    themeClass,
    'h-full w-full max-h-full max-w-full shrink-0 object-contain overflow-visible',
  ].filter(Boolean).join(' ');
}

export function ApogeeLogo({
  variant = 'auto',
  mode = 'nav',
  markOnly,
  className = '',
  priority = false,
}: ApogeeLogoProps) {
  const useMark = markOnly ?? mode === 'mark' ?? false;
  const wrapperClass = [
    'inline-flex shrink-0 items-center justify-center overflow-visible leading-none',
    MODE_CLASS[mode],
    className,
  ].filter(Boolean).join(' ');

  if (variant === 'light' || variant === 'dark') {
    return (
      <span className={wrapperClass} aria-label="Apogee">
        <img
          src={srcFor(variant, useMark)}
          alt="Apogee"
          className={imageClass()}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      </span>
    );
  }

  return (
    <span className={wrapperClass} aria-label="Apogee">
      <img
        src={srcFor('light', useMark)}
        alt="Apogee"
        className={imageClass('theme-logo-dark')}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <img
        src={srcFor('dark', useMark)}
        alt="Apogee"
        className={imageClass('theme-logo-light')}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </span>
  );
}
