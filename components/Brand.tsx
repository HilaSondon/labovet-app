import Image from "next/image";

export default function Brand({ compact = false }: { compact?: boolean }) {
  const size = compact ? 54 : 92;
  return <Image className={`vetconver-logo${compact ? " compact" : ""}`} src="/vetconver-logo.png" alt="VetConver, generador de planillas SIGATM" width={size} height={size} priority />;
}
