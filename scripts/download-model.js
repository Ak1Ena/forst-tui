import { pipeline, env } from '@huggingface/transformers';

async function download() {
    console.log('---------------------------------------------------------');
    console.log('🚀 Pre-downloading embedding model: BAAI/bge-m3...');
    console.log('ℹ️  This may take a minute (approx. 600MB)...');
    console.log('---------------------------------------------------------');

    try {
        const statuses = {};
        // We use the 'feature-extraction' task which is what embeddings use
        await pipeline('feature-extraction', 'Xenova/bge-m3', {
            progress_callback: (progress) => {
                if (progress.status === 'initiate') {
                    statuses[progress.file] = { loaded: 0, total: 0, percent: 0 };
                } else if (progress.status === 'progress') {
                    statuses[progress.file] = {
                        loaded: progress.loaded,
                        total: progress.total,
                        percent: progress.progress
                    };
                } else if (progress.status === 'done') {
                    statuses[progress.file].percent = 100;
                    statuses[progress.file].done = true;
                }

                // Calculate overall progress or just show the most active one
                // For simplicity and to avoid too much noise, we'll show the current file's progress
                if (progress.status === 'progress') {
                    const percent = progress.progress.toFixed(1);
                    const loadedMB = (progress.loaded / 1024 / 1024).toFixed(1);
                    const totalMB = (progress.total / 1024 / 1024).toFixed(1);
                    
                    const barLength = 20;
                    const filledLength = Math.round(barLength * progress.progress / 100);
                    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
                    
                    process.stdout.write(`\r📥 Downloading ${progress.file}: [${bar}] ${percent}% (${loadedMB}/${totalMB}MB)`.padEnd(90));
                } else if (progress.status === 'done') {
                    process.stdout.write(`\n✅ Finished ${progress.file}\n`);
                }
            }
        });
        console.log('---------------------------------------------------------');
        console.log('✅ Model downloaded and cached successfully.');
    } catch (error) {
        console.error('❌ Failed to download model during installation.');
        console.error('⚠️  The model will instead be downloaded on the first run.');
    }
}

download();
