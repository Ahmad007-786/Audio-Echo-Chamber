import React from 'react';
import { Waveform } from './Waveform';
import { HistoryPlayIcon, HistoryPauseIcon } from './Icons';

interface EnhancementPanelProps {
    originalBuffer: AudioBuffer | null;
    processedBuffer: AudioBuffer | null;
    voiceBoost: number;
    clarity: number;
    isClarityOn: boolean;
    onPlayPreview: (type: 'before' | 'after') => void;
    playingPreview: 'before' | 'after' | null;
}

const calculatePeak = (buffer: AudioBuffer | null): number => {
    if (!buffer) return 0;
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) {
            peak = abs;
        }
    }
    return peak;
};


export const EnhancementPanel: React.FC<EnhancementPanelProps> = ({
    originalBuffer,
    processedBuffer,
    clarity,
    isClarityOn,
    onPlayPreview,
    playingPreview,
}) => {
    if (!originalBuffer) return null;

    const originalPeak = calculatePeak(originalBuffer);
    const processedPeak = calculatePeak(processedBuffer);
    const volumeIncrease = originalPeak > 0 ? ((processedPeak / originalPeak - 1) * 100) : 0;

    return (
        <div className="space-y-4 pt-4">
            <h3 className="text-lg font-semibold text-center text-gray-300">Enhancement Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-900/50 rounded-lg">
                <div className="relative">
                    <h4 className="font-semibold text-gray-400 mb-2 text-center">Before</h4>
                    <Waveform audioBuffer={originalBuffer} color="#a0aec0" />
                     <button
                        onClick={() => onPlayPreview('before')}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition-opacity opacity-50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
                        aria-label="Play original audio preview"
                        disabled={!originalBuffer}
                    >
                        {playingPreview === 'before' ? <HistoryPauseIcon /> : <HistoryPlayIcon />}
                    </button>
                </div>
                <div className="relative">
                    <h4 className="font-semibold text-teal-300 mb-2 text-center">After</h4>
                    <Waveform audioBuffer={processedBuffer} color="#4fd1c5" />
                     <button
                        onClick={() => onPlayPreview('after')}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition-opacity opacity-50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-teal-500"
                        aria-label="Play processed audio preview"
                        disabled={!processedBuffer}
                    >
                        {playingPreview === 'after' ? <HistoryPauseIcon /> : <HistoryPlayIcon />}
                    </button>
                </div>
            </div>
            <div className="text-sm text-gray-400 space-y-1 bg-gray-700/50 p-3 rounded-lg">
                <p className="font-bold text-base text-gray-300">Analysis:</p>
                <ul className="list-disc list-inside ml-4">
                    <li>Peak Volume Change: <span className={`font-bold ${volumeIncrease > 0.1 ? 'text-green-400' : 'text-gray-400'}`}>{volumeIncrease.toFixed(1)}%</span></li>
                    <li>Clarity Boost: <span className="font-bold text-teal-300">{clarity > 0 ? `${clarity} dB Applied` : 'Inactive'}</span></li>
                    <li>Noise Reduction: <span className={`font-bold ${isClarityOn ? 'text-green-400' : 'text-gray-400'}`}>{isClarityOn ? 'Active' : 'Inactive'}</span></li>
                </ul>
            </div>
        </div>
    );
};