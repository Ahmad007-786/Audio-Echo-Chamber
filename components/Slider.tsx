
import React from 'react';

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    displayValue: string;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onChange, displayValue }) => (
    <div className="flex flex-col space-y-2">
        <div className="flex justify-between items-center">
            <label htmlFor={label} className="font-medium text-gray-300">{label}</label>
            <span className="text-sm font-mono bg-gray-700 text-teal-300 px-2 py-1 rounded-md">{displayValue}</span>
        </div>
        <input
            id={label}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
        />
    </div>
);
