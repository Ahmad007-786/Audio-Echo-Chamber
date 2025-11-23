import React from 'react';
import type { HistoryItem } from '../App';
import { HistoryPlayIcon, HistoryPauseIcon, LoadIcon, HistoryIcon, InfoIcon } from './Icons';

interface HistoryPanelProps {
    history: HistoryItem[];
    onLoad: (item: HistoryItem) => void;
    onPlay: (item: HistoryItem) => void;
    onDownload: (blob: Blob, fileName: string, format: 'wav' | 'mp3') => void;
    currentlyPlayingId: number | null;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
    history,
    onLoad,
    onPlay,
    onDownload,
    currentlyPlayingId,
}) => {
    return (
        <div className="bg-gray-800 border-2 border-gray-700 rounded-2xl h-full flex flex-col">
            <div className="flex items-center space-x-3 p-4 border-b-2 border-gray-700">
                <HistoryIcon />
                <h2 className="text-xl font-bold text-gray-200">History Panel</h2>
                <span className="text-sm bg-gray-600 text-teal-300 px-2 py-0.5 rounded-full">{history.length}</span>
                <button title="History shows your last 10 processed files from this session." className="ml-auto text-gray-400 hover:text-white focus:outline-none">
                    <InfoIcon />
                </button>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                {history.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-center text-gray-500">
                            Your processed audio files will appear here after you download them.
                        </p>
                    </div>
                ) : (
                    history.map((item) => (
                        <div key={item.id} className="bg-gray-900/50 p-3 rounded-lg flex items-center justify-between space-x-4">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-teal-300">{item.fileName}</p>
                                <p className="text-xs text-gray-400">
                                    {item.timestamp.toLocaleTimeString()} - {item.timestamp.toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                 <button
                                    title="Load into Editor"
                                    onClick={() => onLoad(item)}
                                    className="p-2 rounded-full hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                                >
                                    <LoadIcon />
                                </button>
                                <button
                                    title={currentlyPlayingId === item.id ? 'Pause' : 'Play'}
                                    onClick={() => onPlay(item)}
                                    className="p-1 rounded-full hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                                >
                                    {currentlyPlayingId === item.id ? <HistoryPauseIcon /> : <HistoryPlayIcon />}
                                </button>
                                <div className="flex flex-col space-y-1">
                                    <button
                                        title="Download WAV"
                                        onClick={() => onDownload(item.wavBlob, item.fileName, 'wav')}
                                        className="px-2 py-1 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-500 transition-colors"
                                    >
                                        WAV
                                    </button>
                                    <button
                                        title="Download MP3"
                                        onClick={() => onDownload(item.mp3Blob, item.fileName, 'mp3')}
                                        className="px-2 py-1 text-xs font-bold text-white bg-purple-600 rounded hover:bg-purple-500 transition-colors"
                                    >
                                        MP3
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
