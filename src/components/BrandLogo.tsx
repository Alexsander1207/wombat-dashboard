/** Reference-derived transparent artwork, responsive without altering its proportions. */
export function BrandLogo() {
  const base = import.meta.env.BASE_URL + 'brand/'
  return (
    <picture className="brand-artwork">
      <source
        media="(max-width: 700px)"
        srcSet={
          base +
          'wombat-explorer-compact-192.webp 1x, ' +
          base +
          'wombat-explorer-compact-384.webp 2x'
        }
      />
      <img
        className="brand-logo"
        src={base + 'wombat-explorer-full-480.webp'}
        srcSet={
          base +
          'wombat-explorer-full-480.webp 1x, ' +
          base +
          'wombat-explorer-full-960.webp 2x'
        }
        width={480}
        height={172}
        alt="WOMBAT Explorer"
        decoding="async"
        fetchPriority="high"
      />
    </picture>
  )
}
