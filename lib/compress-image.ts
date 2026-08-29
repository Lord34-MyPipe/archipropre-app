/**
 * Compression côté client des photos agent avant upload.
 *
 * Redimensionne via un canvas offscreen (max 1600 px sur le grand côté) et
 * ré-encode en JPEG qualité 0.8. Objectif : passer de 3-8 Mo (iPhone récent)
 * à < 500 Ko tout en gardant une image parfaitement lisible comme preuve de
 * passage (litige client, contrôle qualité).
 *
 * Fallback : si la compression échoue (canvas non supporté, erreur mémoire),
 * renvoie le fichier original plutôt que de bloquer l'agent.
 */

const MAX_DIMENSION = 1600
const JPEG_QUALITY  = 0.8

export async function compressImage(file: File): Promise<File> {
  // Ne compresser que les images — fallback silencieux sinon
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap

    // Pas besoin de redimensionner si déjà petit
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 500_000) {
      bitmap.close()
      return file
    }

    // Calcul des dimensions cibles (ratio préservé)
    let targetW = width
    let targetH = height
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
      targetW = Math.round(width * ratio)
      targetH = Math.round(height * ratio)
    }

    // OffscreenCanvas si disponible (meilleure mémoire), sinon canvas classique
    let blob: Blob
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(targetW, targetH)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, targetW, targetH)
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, targetW, targetH)
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('toBlob null'))),
          'image/jpeg',
          JPEG_QUALITY,
        )
      })
    }
    bitmap.close()

    // Nom de fichier avec extension .jpg (les API routes détectent l'extension)
    const compressedName = file.name.replace(/\.[^.]+$/, '.jpg')
    return new File([blob], compressedName, { type: 'image/jpeg' })
  } catch {
    // Fallback : envoyer l'original plutôt que bloquer l'agent
    return file
  }
}
