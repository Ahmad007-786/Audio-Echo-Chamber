import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PlayIcon, PauseIcon, DownloadIcon, RecordIcon, StopIcon } from './components/Icons';
import { Slider } from './components/Slider';
import { ToggleSwitch } from './components/ToggleSwitch';
import { HistoryPanel } from './components/HistoryPanel';
import { EnhancementPanel } from './components/EnhancementPanel';

// Inform TypeScript about the lamejs library loaded from CDN
declare const lamejs: any;

export type HistoryItem = {
    id: number;
    fileName: string;
    timestamp: Date;
    audioBuffer: AudioBuffer;
    wavBlob: Blob;
    mp3Blob: Blob;
};


// Helper function to write a string to a DataView
const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

// Helper function to convert an AudioBuffer to a WAV file Blob
const bufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numSamples = buffer.length;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;

    const dataSize = numSamples * numChannels * bytesPerSample;
    const headerSize = 44;
    const fileSize = headerSize + dataSize;

    const wavBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(wavBuffer);

    let offset = 0;

    // RIFF chunk descriptor
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, fileSize - 8, true); offset += 4; // ChunkSize
    writeString(view, offset, 'WAVE'); offset += 4;

    // "fmt " sub-chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size for PCM
    view.setUint16(offset, 1, true); offset += 2; // AudioFormat 1 for PCM
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * bytesPerSample, true); offset += 4; // ByteRate
    view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2; // BlockAlign
    view.setUint16(offset, bitsPerSample, true); offset += 2;

    // "data" sub-chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4; // Subchunk2Size

    // Write the PCM data
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < numSamples; i++) {
        for (let j = 0; j < numChannels; j++) {
            let sample = channels[j][i];
            
            sample = Math.max(-1, Math.min(1, sample));
            const intSample = sample < 0 ? sample * 32768 : sample * 32767;
            
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
};

// Helper function to convert an AudioBuffer to an MP3 file Blob
const bufferToMp3 = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = 128; // Bitrate
    const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const mp3Data: Int8Array[] = [];
    
    const pcmLeft = buffer.getChannelData(0);
    const pcmRight = numChannels > 1 ? buffer.getChannelData(1) : pcmLeft;

    const convertTo16Bit = (float32Array: Float32Array): Int16Array => {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    };

    const samplesLeft = convertTo16Bit(pcmLeft);
    const samplesRight = convertTo16Bit(pcmRight);
    
    const bufferSize = 1152;
    for (let i = 0; i < samplesLeft.length; i += bufferSize) {
        const leftChunk = samplesLeft.subarray(i, i + bufferSize);
        const rightChunk = samplesRight.subarray(i, i + bufferSize);
        const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
        }
    }
    
    const mp3buf = encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
    }

    return new Blob(mp3Data, { type: 'audio/mpeg' });
};


const App: React.FC = () => {
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [processedVisBuffer, setProcessedVisBuffer] = useState<AudioBuffer | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [isPlayingOriginal, setIsPlayingOriginal] = useState<boolean>(false);
    const [isPlayingProcessed, setIsPlayingProcessed] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [renderingFormat, setRenderingFormat] = useState<'wav' | 'mp3' | null>(null);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [recordingTime, setRecordingTime] = useState<number>(0);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [playingHistoryId, setPlayingHistoryId] = useState<number | null>(null);
    const [playingPreview, setPlayingPreview] = useState<'before' | 'after' | null>(null);


    // Effect parameters state
    const [delayTime, setDelayTime] = useState<number>(0.5);
    const [feedback, setFeedback] = useState<number>(0.5);
    const [isClarityOn, setIsClarityOn] = useState<boolean>(false);
    const [voiceBoost, setVoiceBoost] = useState<number>(1);
    const [clarity, setClarity] = useState<number>(0);

    // Refs for Web Audio API nodes and sources
    const audioContextRef = useRef<AudioContext | null>(null);
    const originalSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const processedSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const historySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const beforePreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const afterPreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<number | null>(null);

    // Effect nodes
    const delayNodeRef = useRef<DelayNode | null>(null);
    const feedbackGainNodeRef = useRef<GainNode | null>(null);
    const noiseReductionFilterRef = useRef<BiquadFilterNode | null>(null);
    const dryGainRef = useRef<GainNode | null>(null);
    const wetGainRef = useRef<GainNode | null>(null);
    const masterProcessedGainRef = useRef<GainNode | null>(null);
    const voiceBoostGainNodeRef = useRef<GainNode | null>(null);
    const clarityFilterNodeRef = useRef<BiquadFilterNode | null>(null);


    const setupAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = context;

            masterProcessedGainRef.current = context.createGain();
            delayNodeRef.current = context.createDelay(2.0);
            feedbackGainNodeRef.current = context.createGain();
            noiseReductionFilterRef.current = context.createBiquadFilter();
            voiceBoostGainNodeRef.current = context.createGain();
            clarityFilterNodeRef.current = context.createBiquadFilter();
            
            delayNodeRef.current.delayTime.value = delayTime;
            feedbackGainNodeRef.current.gain.value = feedback;
            noiseReductionFilterRef.current.type = 'allpass';
            voiceBoostGainNodeRef.current.gain.value = voiceBoost;
            
            clarityFilterNodeRef.current.type = 'peaking';
            clarityFilterNodeRef.current.frequency.value = 3500;
            clarityFilterNodeRef.current.Q.value = 1.5;
            clarityFilterNodeRef.current.gain.value = clarity;

            delayNodeRef.current.connect(feedbackGainNodeRef.current);
            feedbackGainNodeRef.current.connect(delayNodeRef.current);
            
            delayNodeRef.current.connect(noiseReductionFilterRef.current);
            noiseReductionFilterRef.current.connect(masterProcessedGainRef.current);

            masterProcessedGainRef.current.connect(voiceBoostGainNodeRef.current);
            voiceBoostGainNodeRef.current.connect(clarityFilterNodeRef.current);
            clarityFilterNodeRef.current.connect(context.destination);
        }
    }, [delayTime, feedback, voiceBoost, clarity]);

    const stopAllPlayback = () => {
        originalSourceRef.current?.stop();
        processedSourceRef.current?.stop();
        historySourceRef.current?.stop();
        beforePreviewSourceRef.current?.stop();
        afterPreviewSourceRef.current?.stop();
        setIsPlayingOriginal(false);
        setIsPlayingProcessed(false);
        setPlayingHistoryId(null);
        setPlayingPreview(null);
    };

    const loadFile = async (file: File) => {
        if (!file) return;
        stopAllPlayback();

        setupAudioContext();
        const context = audioContextRef.current;
        if (!context) return;
        
        setFileName(file.name);
        setAudioBuffer(null);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const decodedData = await context.decodeAudioData(arrayBuffer);
            setAudioBuffer(decodedData);
        } catch (error) {
            console.error("Error decoding audio data:", error);
            setFileName('Failed to load. Format may not be supported.');
            setAudioBuffer(null);
        }
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) loadFile(file);
        event.target.value = '';
    };
    
    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) loadFile(file);
        else setFileName("Please drop an audio file.");
    };

    const toggleOriginalPlayback = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !audioBuffer) return;

        if (isPlayingOriginal) {
            originalSourceRef.current?.stop();
        } else {
            stopAllPlayback();
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(context.destination);
            source.onended = () => setIsPlayingOriginal(false);
            source.start(0);
            originalSourceRef.current = source;
            setIsPlayingOriginal(true);
        }
    }, [audioBuffer, isPlayingOriginal]);

    const toggleProcessedPlayback = useCallback(() => {
        const context = audioContextRef.current;
        if (!context || !audioBuffer || !delayNodeRef.current || !masterProcessedGainRef.current) return;

        if (isPlayingProcessed) {
            processedSourceRef.current?.stop();
        } else {
            stopAllPlayback();
            const source = context.createBufferSource();
            source.buffer = audioBuffer;

            dryGainRef.current = context.createGain();
            wetGainRef.current = context.createGain();
            
            source.connect(dryGainRef.current);
            source.connect(wetGainRef.current);

            dryGainRef.current.connect(masterProcessedGainRef.current);
            wetGainRef.current.connect(delayNodeRef.current);

            source.onended = () => {
                setIsPlayingProcessed(false);
                dryGainRef.current?.disconnect();
                wetGainRef.current?.disconnect();
            };
            source.start(0);
            processedSourceRef.current = source;
            setIsPlayingProcessed(true);
        }
    }, [audioBuffer, isPlayingProcessed]);
    
    const togglePreviewPlayback = useCallback((type: 'before' | 'after') => {
        const context = audioContextRef.current;
        if (!context || !audioBuffer || (type === 'after' && !processedVisBuffer)) return;
    
        if (playingPreview === type) {
            if (type === 'before') beforePreviewSourceRef.current?.stop();
            if (type === 'after') afterPreviewSourceRef.current?.stop();
            // onended will set playingPreview to null
        } else {
            stopAllPlayback();
            const source = context.createBufferSource();
            const bufferToPlay = type === 'before' ? audioBuffer : processedVisBuffer;
            if (!bufferToPlay) return;
            source.buffer = bufferToPlay;
            source.connect(context.destination);
            source.onended = () => {
                setPlayingPreview(null);
                if (type === 'before') beforePreviewSourceRef.current = null;
                if (type === 'after') afterPreviewSourceRef.current = null;
            };
            source.start(0);
            if (type === 'before') beforePreviewSourceRef.current = source;
            if (type === 'after') afterPreviewSourceRef.current = source;
            setPlayingPreview(type);
        }
    }, [audioBuffer, processedVisBuffer, playingPreview]);

    const handleDownload = async (format: 'wav' | 'mp3') => {
        if (!audioBuffer) return;
        setRenderingFormat(format);

        try {
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );
            
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            
            const masterGain = offlineContext.createGain();
            const delay = offlineContext.createDelay(2.0);
            const feedbackGain = offlineContext.createGain();
            const noiseReduction = offlineContext.createBiquadFilter();
            const boost = offlineContext.createGain();
            const clarityFilter = offlineContext.createBiquadFilter();
            const dry = offlineContext.createGain();
            const wet = offlineContext.createGain();

            delay.delayTime.value = delayTime;
            feedbackGain.gain.value = feedback;
            boost.gain.value = voiceBoost;
            clarityFilter.type = 'peaking';
            clarityFilter.frequency.value = 3500;
            clarityFilter.Q.value = 1.5;
            clarityFilter.gain.value = clarity;
            
            if (isClarityOn) {
                noiseReduction.type = 'lowpass';
                noiseReduction.frequency.value = 5000;
                noiseReduction.Q.value = 1;
            } else {
                noiseReduction.type = 'allpass';
            }

            source.connect(dry);
            source.connect(wet);
            dry.connect(masterGain);
            wet.connect(delay);
            delay.connect(feedbackGain);
            feedbackGain.connect(delay);
            delay.connect(noiseReduction);
            noiseReduction.connect(masterGain);
            masterGain.connect(boost);
            boost.connect(clarityFilter);
            clarityFilter.connect(offlineContext.destination);

            source.start(0);
            const renderedBuffer = await offlineContext.startRendering();
            
            const wavBlob = bufferToWav(renderedBuffer);
            const mp3Blob = bufferToMp3(renderedBuffer);

            const newHistoryItem: HistoryItem = {
                id: Date.now(),
                fileName: fileName.split('.')[0] || 'recording',
                timestamp: new Date(),
                audioBuffer: renderedBuffer,
                wavBlob,
                mp3Blob,
            };
            setHistory(prev => [newHistoryItem, ...prev].slice(0, 10));

            const blobToDownload = format === 'wav' ? wavBlob : mp3Blob;
            const fileExtension = format;

            const url = URL.createObjectURL(blobToDownload);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `processed_${newHistoryItem.fileName}.${fileExtension}`;
            document.body.appendChild(a);
a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

        } catch (error) {
            console.error(`Error rendering audio to ${format}:`, error);
            alert(`Failed to process audio for ${format} download.`);
        } finally {
            setRenderingFormat(null);
        }
    };

    const startRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stopAllPlayback();

            setIsRecording(true);
            setRecordingTime(0);
            audioChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const audioFile = new File([audioBlob], `recording-${new Date().toISOString()}.wav`, { type: 'audio/wav' });
                loadFile(audioFile);
                stream.getTracks().forEach(track => track.stop());
            };
            
            recorder.start();
            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error("Error starting recording:", error);
            alert("Could not start recording. Please grant microphone permission.");
        }
    };

    const stopRecording = () => {
        if (!isRecording || !mediaRecorderRef.current) return;
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    };

    const handleHistoryLoad = useCallback((item: HistoryItem) => {
        stopAllPlayback();
        setAudioBuffer(item.audioBuffer);
        setFileName(`${item.fileName} (from history)`);
    }, []);

    const handleHistoryPlay = useCallback((item: HistoryItem) => {
        if (playingHistoryId === item.id) {
            historySourceRef.current?.stop();
            setPlayingHistoryId(null);
            return;
        }

        stopAllPlayback();
        const context = audioContextRef.current;
        if (!context) return;
        
        const source = context.createBufferSource();
        source.buffer = item.audioBuffer;
        source.connect(context.destination);
        source.onended = () => {
            setPlayingHistoryId(null);
            historySourceRef.current = null;
        };
        source.start(0);
        historySourceRef.current = source;
        setPlayingHistoryId(item.id);
    }, [playingHistoryId]);

    const handleHistoryDownload = useCallback((blob: Blob, fileName: string, format: 'wav' | 'mp3') => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_${fileName}.${format}`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();
    }, []);

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };


    useEffect(() => {
        if(audioContextRef.current && delayNodeRef.current) {
            delayNodeRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current.currentTime);
        }
    }, [delayTime]);

    useEffect(() => {
        if(audioContextRef.current && feedbackGainNodeRef.current) {
            feedbackGainNodeRef.current.gain.setValueAtTime(feedback, audioContextRef.current.currentTime);
        }
    }, [feedback]);

    useEffect(() => {
        if(audioContextRef.current && noiseReductionFilterRef.current) {
            if (isClarityOn) {
                noiseReductionFilterRef.current.type = 'lowpass';
                noiseReductionFilterRef.current.frequency.setValueAtTime(5000, audioContextRef.current.currentTime);
                noiseReductionFilterRef.current.Q.setValueAtTime(1, audioContextRef.current.currentTime);
            } else {
                noiseReductionFilterRef.current.type = 'allpass';
            }
        }
    }, [isClarityOn]);

    useEffect(() => {
        if (audioContextRef.current && voiceBoostGainNodeRef.current) {
            voiceBoostGainNodeRef.current.gain.setValueAtTime(voiceBoost, audioContextRef.current.currentTime);
        }
    }, [voiceBoost]);

    useEffect(() => {
        if (audioContextRef.current && clarityFilterNodeRef.current) {
            clarityFilterNodeRef.current.gain.setValueAtTime(clarity, audioContextRef.current.currentTime);
        }
    }, [clarity]);

    useEffect(() => {
        if (!audioBuffer) {
            setProcessedVisBuffer(null);
            return;
        }

        const processForVis = async () => {
            try {
                const offlineContext = new OfflineAudioContext(
                    audioBuffer.numberOfChannels,
                    audioBuffer.length,
                    audioBuffer.sampleRate
                );
    
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffer;
    
                const boost = offlineContext.createGain();
                const clarityFilter = offlineContext.createBiquadFilter();
                const noiseReduction = offlineContext.createBiquadFilter();
                
                boost.gain.value = voiceBoost;
    
                clarityFilter.type = 'peaking';
                clarityFilter.frequency.value = 3500;
                clarityFilter.Q.value = 1.5;
                clarityFilter.gain.value = clarity;
    
                if (isClarityOn) {
                    noiseReduction.type = 'lowpass';
                    noiseReduction.frequency.value = 5000;
                    noiseReduction.Q.value = 1;
                } else {
                    noiseReduction.type = 'allpass';
                }
    
                source.connect(boost);
                boost.connect(clarityFilter);
                clarityFilter.connect(noiseReduction);
                noiseReduction.connect(offlineContext.destination);
    
                source.start(0);
                const renderedBuffer = await offlineContext.startRendering();
                setProcessedVisBuffer(renderedBuffer);
    
            } catch (e) {
                console.error("Error processing audio for visualization:", e);
            }
        };
    
        processForVis();
    }, [audioBuffer, voiceBoost, clarity, isClarityOn]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
            <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                {/* Main Content */}
                <div className="lg:w-2/3 w-full bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
                    <div className="p-6 md:p-8 space-y-8">
                        <header className="text-center">
                            <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
                                Audio Echo Chamber
                            </h1>
                            <p className="text-gray-400 mt-2">Upload, record, and enhance your audio with real-time effects.</p>
                        </header>

                        <main className="space-y-6">
                            <div
                                className={`bg-gray-900/50 rounded-lg border-2 border-dashed transition-colors duration-300 ${isDragging ? 'border-teal-500 bg-gray-900' : 'border-gray-600'}`}
                                onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-600">
                                    <div className="p-6 flex flex-col items-center justify-center">
                                        <input type="file" id="audio-file" accept="audio/*" className="hidden" onChange={handleFileChange} />
                                        <label htmlFor="audio-file" className="cursor-pointer bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105">
                                            Upload Audio File
                                        </label>
                                        <p className="text-gray-500 mt-2 text-sm">or drag and drop</p>
                                    </div>
                                    <div className="p-6 flex flex-col items-center justify-center">
                                        <h3 className="text-lg font-semibold text-gray-300 mb-3">Record Audio</h3>
                                        <button onClick={isRecording ? stopRecording : startRecording} className={`w-16 h-16 flex items-center justify-center rounded-full text-white transition-transform transform hover:scale-110 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 ${isRecording ? 'bg-red-600 focus:ring-red-500' : 'bg-blue-600 focus:ring-blue-500'}`} aria-label={isRecording ? 'Stop recording' : 'Start recording'}>
                                            {isRecording ? <StopIcon /> : <RecordIcon />}
                                        </button>
                                        {isRecording && (
                                            <p className="text-lg font-mono text-red-400 animate-pulse mt-2">{formatTime(recordingTime)}</p>
                                        )}
                                    </div>
                                </div>
                                <p id="file-status" className="text-center text-gray-400 p-3 bg-gray-900/40 border-t-2 border-gray-600 border-dashed text-sm truncate max-w-full">
                                    {fileName ? `Loaded: ${fileName}` : "No file loaded"}
                                </p>
                            </div>


                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-700">
                                <div className="flex flex-col items-center justify-center p-4 bg-gray-700/50 rounded-lg space-y-3">
                                    <h2 className="font-semibold text-lg">Original Audio</h2>
                                    <button onClick={toggleOriginalPlayback} disabled={!audioBuffer} className="w-16 h-16 flex items-center justify-center rounded-full bg-blue-600 text-white disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-transform transform hover:scale-110 active:scale-100" aria-label={isPlayingOriginal ? "Pause original audio" : "Play original audio"}>
                                        {isPlayingOriginal ? <PauseIcon /> : <PlayIcon />}
                                    </button>
                                </div>
                                <div className="flex flex-col items-center justify-center p-4 bg-gray-700/50 rounded-lg space-y-3">
                                    <h2 className="font-semibold text-lg">Processed Audio</h2>
                                    <div className="flex items-center gap-4">
                                        <button onClick={toggleProcessedPlayback} disabled={!audioBuffer} className="w-16 h-16 flex items-center justify-center rounded-full bg-teal-600 text-white disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500 transition-transform transform hover:scale-110 active:scale-100" aria-label={isPlayingProcessed ? "Pause processed audio" : "Play processed audio"}>
                                            {isPlayingProcessed ? <PauseIcon /> : <PlayIcon />}
                                        </button>
                                        <div className="flex flex-col space-y-2">
                                            <button onClick={() => handleDownload('wav')} disabled={!audioBuffer || renderingFormat !== null} className="w-36 h-8 flex items-center justify-center rounded-md bg-indigo-600 text-white text-sm font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-transform transform hover:scale-105 active:scale-100" aria-label="Download processed audio as WAV">
                                                {renderingFormat === 'wav' ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <><DownloadIcon /><span className="ml-2">Download WAV</span></>}
                                            </button>
                                            <button onClick={() => handleDownload('mp3')} disabled={!audioBuffer || renderingFormat !== null} className="w-36 h-8 flex items-center justify-center rounded-md bg-purple-600 text-white text-sm font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 transition-transform transform hover:scale-105 active:scale-100" aria-label="Download processed audio as MP3">
                                                {renderingFormat === 'mp3' ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <><DownloadIcon /><span className="ml-2">Download MP3</span></>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-4 border-t border-gray-700">
                                <h3 className="text-xl font-semibold text-center text-gray-300">Echo Effects</h3>
                                <Slider label="Echo Speed (Delay)" min={0.01} max={1.0} step={0.01} value={delayTime} onChange={(e) => setDelayTime(parseFloat(e.target.value))} displayValue={`${delayTime.toFixed(2)} s`} />
                                <Slider label="Echo Intensity (Feedback)" min={0} max={0.95} step={0.01} value={feedback} onChange={(e) => setFeedback(parseFloat(e.target.value))} displayValue={`${Math.round(feedback * 100)}%`} />
                            </div>

                            <div className="space-y-6 pt-4 border-t border-gray-700">
                                <h3 className="text-xl font-semibold text-center text-gray-300">Voice Enhancement</h3>
                                <Slider label="Voice Boost" min={1} max={3} step={0.1} value={voiceBoost} onChange={(e) => setVoiceBoost(parseFloat(e.target.value))} displayValue={`${Math.round(voiceBoost * 100)}%`} />
                                <Slider label="Clarity" min={0} max={12} step={0.5} value={clarity} onChange={(e) => setClarity(parseFloat(e.target.value))} displayValue={`${clarity.toFixed(1)} dB`} />
                                <ToggleSwitch label="Noise Reduction" description="Reduces high-frequency noise." enabled={isClarityOn} setEnabled={setIsClarityOn} />
                                <EnhancementPanel
                                    originalBuffer={audioBuffer}
                                    processedBuffer={processedVisBuffer}
                                    voiceBoost={voiceBoost}
                                    clarity={clarity}
                                    isClarityOn={isClarityOn}
                                    onPlayPreview={togglePreviewPlayback}
                                    playingPreview={playingPreview}
                                />
                            </div>
                        </main>
                    </div>
                </div>

                {/* History Panel */}
                <div className="lg:w-1/3 w-full">
                     <HistoryPanel
                        history={history}
                        onLoad={handleHistoryLoad}
                        onPlay={handleHistoryPlay}
                        onDownload={handleHistoryDownload}
                        currentlyPlayingId={playingHistoryId}
                    />
                </div>
            </div>
        </div>
    );
};

export default App;