import { Request, Response } from 'express';
import { uploadDwgFile } from './server.js';
import * as aps from './apsService.js';

export async function handleDwgUpload(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No DWG file provided' });
      return;
    }

    console.log(`📂 Processing uploaded DWG: ${req.file.originalname}`);

    const { id, localPath } = await uploadDwgFile(req.file.buffer, req.file.originalname);
    console.log(`✅ DWG uploaded with ID: ${id}`);

    // Start APS translation and return URN immediately
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
  console.log(`📂 Processing uploaded DWG: ${req.file!.originalname}`);
  sendUpdate('status', { message: 'Subiendo y analizando archivo DWG...', stage: 'upload' });

  const { id, localPath } = await uploadDwgFile(req.file!.buffer, req.file!.originalname);
  console.log(`✅ DWG uploaded with ID: ${id}`);

  // Asynchronously start the translation to not block the chat flow
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

  return { dwgId: id, localPath };
}