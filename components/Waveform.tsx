import React, { useRef, useEffect } from 'react';

interface WaveformProps {
    audioBuffer: AudioBuffer | null;
    color?: string;
}

export const Waveform: React.FC<WaveformProps> = ({ audioBuffer, color = '#4fd1c5' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.scale(dpr, dpr);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.clearRect(0, 0, width, height);

        if (!audioBuffer) {
            return;
        }
        
        const channelData = audioBuffer.getChannelData(0);
        const step = Math.ceil(channelData.length / width);
        const amp = height / 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Find the absolute max value for normalization to prevent clipping in visualization
        let absMax = 0;
        for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > absMax) {
                absMax = Math.abs(channelData[i]);
            }
        }
        const normalizationFactor = absMax > 1 ? 1 / absMax : 1;

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = channelData[(i * step) + j] * normalizationFactor;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            // Draw a single vertical line for the min/max range
            const x = i + 0.5; // Center the line in the pixel
            const yMin = (1 + min) * amp;
            const yMax = (1 + max) * amp;

            ctx.moveTo(x, yMin);
            ctx.lineTo(x, yMax);
        }
        ctx.stroke();

    }, [audioBuffer, color]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '70px' }} className="bg-gray-900 rounded-md"></canvas>;
};
