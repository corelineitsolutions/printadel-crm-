import fs from "fs";
import path from "path";

/**
 * Saves an array of image data (base64 data URLs or existing URLs) to the uploads/punchouts directory
 * Returns an array of accessible relative URLs (e.g. /uploads/punchouts/...)
 */
export function savePunchOutImages(userId: string, images: string[]): string[] {
  if (!images || images.length === 0) return [];

  const uploadDir = path.join(__dirname, "../../uploads/punchouts");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const savedUrls: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const imgStr = images[i];
    if (!imgStr) continue;

    // Check if it is a base64 data URL
    const match = imgStr.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (match) {
      const mimeSub = match[1].toLowerCase();
      const ext = mimeSub === "jpeg" || mimeSub === "jpg" ? "jpg" : mimeSub === "png" ? "png" : "jpg";
      const base64Data = match[2];
      const filename = `punchout_${userId}_${Date.now()}_${i + 1}.${ext}`;
      const filePath = path.join(uploadDir, filename);

      try {
        fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        savedUrls.push(`/uploads/punchouts/${filename}`);
      } catch (err) {
        console.error(`Failed to save punch-out image ${i}:`, err);
      }
    } else if (imgStr.startsWith("/uploads/") || imgStr.startsWith("http")) {
      savedUrls.push(imgStr);
    }
  }

  return savedUrls;
}
