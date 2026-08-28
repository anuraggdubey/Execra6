import fs from "fs"
import path from "path"
import { chromium } from "playwright"

function createIcoFromPngs(pngBuffers, sizes) {
  const numImages = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type 1 = ICO
  header.writeUInt16LE(numImages, 4) // Number of images

  const directoryEntries = []
  let offset = 6 + numImages * 16

  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const buf = pngBuffers[i]
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // Width
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // Height
    entry.writeUInt8(0, 2) // Color palette (0 = no palette)
    entry.writeUInt8(0, 3) // Reserved
    entry.writeUInt16LE(1, 4) // Color planes
    entry.writeUInt16LE(32, 6) // Bits per pixel (32-bit RGBA)
    entry.writeUInt32LE(buf.length, 8) // Size of image data
    entry.writeUInt32LE(offset, 12) // Offset of image data
    directoryEntries.push(entry)
    offset += buf.length
  }

  return Buffer.concat([header, ...directoryEntries, ...pngBuffers])
}

async function main() {
  const svgPath = path.resolve("public/icon.svg")
  const svgContent = fs.readFileSync(svgPath, "utf-8")

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const sizes = [16, 32, 48, 64]
  const pngBuffers = []

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
            svg { width: ${size}px; height: ${size}px; display: block; }
          </style>
        </head>
        <body>
          ${svgContent}
        </body>
      </html>
    `)
    const png = await page.screenshot({ omitBackground: true, type: "png" })
    pngBuffers.push(png)
  }

  // Also generate 180x180 apple touch icon
  await page.setViewportSize({ width: 180, height: 180 })
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body { margin: 0; padding: 0; width: 180px; height: 180px; overflow: hidden; background: transparent; }
          svg { width: 180px; height: 180px; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `)
  const appleIcon = await page.screenshot({ omitBackground: false, type: "png" })
  fs.writeFileSync(path.resolve("public/apple-touch-icon.png"), appleIcon)
  console.log("Created public/apple-touch-icon.png")

  await browser.close()

  const icoBuffer = createIcoFromPngs(pngBuffers, sizes)
  fs.writeFileSync(path.resolve("public/favicon.ico"), icoBuffer)
  fs.writeFileSync(path.resolve("app/favicon.ico"), icoBuffer)
  console.log("Created public/favicon.ico and app/favicon.ico successfully!")
}

main().catch(err => {
  console.error("Error generating favicons:", err)
  process.exit(1)
})
