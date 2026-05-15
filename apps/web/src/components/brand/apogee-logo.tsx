/* eslint-disable @next/next/no-img-element -- SVG brand assets are served directly from /public to avoid Next Image SVG friction. */

type ApogeeLogoProps = {
  variant?: 'auto' | 'light' | 'dark';
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

function srcFor(variant: 'light' | 'dark', markOnly: boolean): string {
  return ASSETS[markOnly ? 'mark' : 'logo'][variant];
}

export function ApogeeLogo({
  variant = 'auto',
  markOnly = false,
  className = '',
  priority = false,
}: ApogeeLogoProps) {
  const baseClass = ['block h-auto w-auto object-contain', className].filter(Boolean).join(' ');

  if (variant === 'light' || variant === 'dark') {
    return (
      <img
        src={srcFor(variant, markOnly)}
        alt="Apogee"
        className={baseClass}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    );
  }

  return (
    <>
      <img
        src={srcFor('light', markOnly)}
        alt="Apogee"
        className={`theme-logo-dark ${baseClass}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <img
        src={srcFor('dark', markOnly)}
        alt="Apogee"
        className={`theme-logo-light ${baseClass}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </>
  );
}
