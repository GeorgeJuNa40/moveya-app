// ============================================================================
// Move yA — Extracción de texto de archivos para la base de conocimiento del bot
// ----------------------------------------------------------------------------
// Convierte a texto plano los documentos que suba el estudio, para nutrir al bot:
//   • .txt / .md / .csv       → se leen directo.
//   • .pdf                    → se extrae el texto con pdf.js (carga diferida).
//   • .docx (Word moderno)    → se descomprime el .docx y se lee word/document.xml.
//   • .doc (Word antiguo)     → no compatible (pedir .docx o PDF).
// Las librerías pesadas (pdf.js, fflate) se importan SOLO cuando se necesitan,
// para no engordar el bundle principal.
// ============================================================================

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (name.endsWith('.pdf') || type === 'application/pdf') {
    return extractPdf(file);
  }
  if (
    name.endsWith('.docx') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(file);
  }
  if (name.endsWith('.doc')) {
    throw new Error('El formato .doc (Word antiguo) no es compatible. Guárdalo como .docx o PDF.');
  }
  // .txt / .md / .csv / texto plano en general.
  return file.text();
}

// --- PDF: pdf.js (carga diferida, worker empaquetado localmente) --------------
async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = content.items.map((it: any) => (typeof it?.str === 'string' ? it.str : '')).join(' ');
    out += line + '\n';
  }
  try {
    await doc.destroy();
  } catch {
    /* ignore */
  }
  return out;
}

// --- DOCX: descomprimir el zip y leer el XML del documento --------------------
async function extractDocx(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const xmlBytes = files['word/document.xml'];
  if (!xmlBytes) throw new Error('No pude leer el .docx (archivo dañado o vacío).');
  let xml = strFromU8(xmlBytes);
  // Párrafos y saltos → renglones nuevos.
  xml = xml.replace(/<\/w:p>/g, '\n').replace(/<w:br\s*\/?>/g, '\n');
  // Quita todas las etiquetas XML.
  let text = xml.replace(/<[^>]+>/g, '');
  // Decodifica las entidades más comunes.
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text;
}
