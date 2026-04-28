import { pipeline, env } from '@huggingface/transformers';

async function download() {
    console.log('---------------------------------------------------------');
    console.log('🚀 Pre-downloading embedding model: BAAI/bge-m3...');
    console.log('ℹ️  This may take a minute (approx. 600MB)...');
    console.log('---------------------------------------------------------');

    try {
        // We use the 'feature-extraction' task which is what embeddings use
        await pipeline('feature-extraction', 'Xenova/bge-m3');
        console.log('✅ Model downloaded and cached successfully.');
    } catch (error) {
        console.error('❌ Failed to download model during installation.');
        console.error('⚠️  The model will instead be downloaded on the first run.');
    }
}

download();
