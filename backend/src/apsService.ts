// This service will encapsulates all interactions with the Autodesk Platform Services (APS).
import forge from 'forge-apis';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const APS_BUCKET_KEY = process.env.APS_BUCKET_KEY;

if (!APS_CLIENT_ID || !APS_CLIENT_SECRET || !APS_BUCKET_KEY) {
  console.error('Missing required APS environment variables (APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET_KEY)');
  process.exit(1);
}

// Create the Auth Client with auto-refresh enabled
// Scopes: bucket operations, data operations, and model derivative (translation)
const auth = new forge.AuthClientTwoLegged(APS_CLIENT_ID, APS_CLIENT_SECRET, ['bucket:create', 'bucket:read', 'data:write', 'data:read', 'code:all'], true);

// Get the default API client instance
const defaultClient = forge.ApiClient.instance;

// Instantiate API clients 
const bucketsApi = new forge.BucketsApi();
const objectsApi = new forge.ObjectsApi();
const derivativesApi = new forge.DerivativesApi();

/**
 * Gets a 2-legged authentication token from APS and configures the default client.
 */
export async function getAuthToken() {
  const credentials = await auth.authenticate();
  
  // Set the Authorization header on the default client for all subsequent requests
  defaultClient.defaultHeaders = defaultClient.defaultHeaders || {};
  defaultClient.defaultHeaders['Authorization'] = 'Bearer ' + credentials.access_token;
  
  return credentials;
}

/**
 * Checks the status of a translation job.
 * @param urn The URN of the object being translated.
 * @returns The translation manifest with status information.
 */
export async function getTranslationStatus(urn: string) {
  await getAuthToken(); // Ensure we have fresh authentication
  return derivativesApi.getManifest(urn);
}

/**
 * Ensures the application's default bucket exists on APS.
 * Creates it if it doesn't.
 */
async function ensureBucketExists() {
  // Ensure we have fresh authentication
  await getAuthToken();
  
  try {
    await bucketsApi.getBucketDetails(APS_BUCKET_KEY!);
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.log(`Bucket ${APS_BUCKET_KEY} not found, creating...`);
      await bucketsApi.createBucket({
        bucketKey: APS_BUCKET_KEY!,
        policyKey: 'transient'
      });
      console.log(`Bucket ${APS_BUCKET_KEY} created.`);
    } else {
      throw error;
    }
  }
}

/**
 * Uploads a file to the APS bucket and starts the translation job.
 * @param dwgId The internal ID of the DWG file.
 * @param filePath The local path to the DWG file.
 * @returns The URN of the object for the viewer.
 */
export async function uploadAndTranslateDwg(dwgId: string, filePath: string): Promise<string> {
  await ensureBucketExists();

  const objectName = `${dwgId}.dwg`;
  const fileContent = fs.readFileSync(filePath);

  // Upload the file to the bucket using the modern uploadResources method
  const uploadResults = await objectsApi.uploadResources(
    APS_BUCKET_KEY!,
    [
      {
        objectKey: objectName,
        data: fileContent
      }
    ]
  );

  const objectId = uploadResults[0].completed.objectId;

  // Start the translation job
  // Create properly formatted base64url URN (replace +/= with -/_ and remove padding)
  const urn = Buffer.from(objectId)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const job = {
    input: {
      urn: urn
    },
    output: {
      formats: [
        {
          type: 'svf',
          views: ['2d', '3d']
        }
      ]
    }
  };

  await derivativesApi.translate(job);

  // Return the URN for the viewer
  return urn;
}
