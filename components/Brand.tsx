export default function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`vetconver-wordmark${compact ? " compact" : ""}`} aria-label="VetConver"><span>Vet</span><strong>Conver</strong></span>;
}
