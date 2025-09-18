import { Request, Response } from 'express';
import { uploadDwgFile } from './server.js';
import * as aps from './apsService.js';

export async function handleDwgUpload(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No DWG file provided' });
      return;
    }

    console.log(`📂 Processing uploaded DWG: ${req.file.originalname} (${req.file.size} bytes)`);

    const { id, localPath } = await uploadDwgFile(req.file.buffer, req.file.originalname);
    console.log(`✅ DWG uploaded with ID: ${id}`);

    // Check file size (10MB limit for Autodesk viewer)
    const maxSizeForViewer = 2 * 1024 * 1024; // 10MB
    const isLargeFile = req.file.size > maxSizeForViewer;

    if (isLargeFile) {
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
      console.log(`⚠️  Large file detected (${fileSizeMB}MB), skipping Autodesk viewer processing`);

      res.json({
        dwgId: id,
        message: `DWG uploaded successfully. File is large (${fileSizeMB}MB), viewer unavailable but queries work normally.`
      });
      return;
    }

    // Start APS translation for files <= 10MB
    try {
      const urn = await aps.uploadAndTranslateDwg(id, localPath);
      console.log(`✅ DWG translation started. URN: ${urn}`);

      res.json({
        dwgId: id,
        urn: urn,
        message: 'DWG uploaded successfully'
      });
    } catch (apsError) {
      console.error('APS translation failed:', apsError);
      // Still return success with dwgId, just no URN for viewer
      res.json({
        dwgId: id,
        message: 'DWG uploaded successfully (viewer unavailable)'
      });
    }

  } catch (error: any) {
    console.error('❌ Upload endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleDwgUploadWithChat(
  req: Request,
  res: Response,
  sendUpdate: (type: string, data: any) => void
): Promise<{ dwgId: string; localPath: string }> {
  console.log(`📂 Processing uploaded DWG: ${req.file!.originalname} (${req.file!.size} bytes)`);
  sendUpdate('status', { message: 'Subiendo y analizando archivo DWG...', stage: 'upload' });

  const { id, localPath } = await uploadDwgFile(req.file!.buffer, req.file!.originalname);
  console.log(`✅ DWG uploaded with ID: ${id}`);

  // Check file size (10MB limit for Autodesk viewer)
  const maxSizeForViewer = 10 * 1024 * 1024; // 10MB
  const isLargeFile = req.file!.size > maxSizeForViewer;

  if (isLargeFile) {
    const fileSizeMB = (req.file!.size / (1024 * 1024)).toFixed(2);
    console.log(`⚠️  Large file detected (${fileSizeMB}MB), skipping Autodesk viewer processing`);

    sendUpdate('dwg_uploaded', {
      dwgId: id,
      message: `DWG file processed successfully! File is large (${fileSizeMB}MB), viewer unavailable but all queries work normally.`
    });
  } else {
    // Asynchronously start the translation to not block the chat flow for files <= 10MB
    aps.uploadAndTranslateDwg(id, localPath)
      .then(urn => {
        console.log(`✅ DWG translation started. URN: ${urn}`);
        sendUpdate('dwg_translation_started', { urn });
      })
      .catch(err => {
        console.error('APS translation failed:', err);
        sendUpdate('dwg_translation_failed', { error: 'Could not prepare DWG for viewing.' });
      });

    sendUpdate('dwg_uploaded', { dwgId: id, message: 'DWG file processed successfully!' });
  }

  return { dwgId: id, localPath };
}