import { useState, useEffect } from 'react';
import { WavRecorder } from '../lib/wavtools/index.js';
import './MicrophoneSelector.scss';

interface MicrophoneSelectorProps {
  wavRecorder: WavRecorder;
  isConnected: boolean;
  onDeviceChange: (deviceId: string) => void;
}

interface DeviceInfo {
  deviceId: string;
  label: string;
  default?: boolean;
}

export function MicrophoneSelector({ 
  wavRecorder, 
  isConnected, 
  onDeviceChange 
}: MicrophoneSelectorProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Load available devices
  const loadDevices = async () => {
    setIsLoading(true);
    try {
      const deviceList = await wavRecorder.listDevices();
      const formattedDevices = deviceList.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 8)}...`,
        default: device.default
      }));
      setDevices(formattedDevices);
      
      // Set default device as selected
      const defaultDevice = formattedDevices.find(d => d.default);
      if (defaultDevice) {
        setSelectedDeviceId(defaultDevice.deviceId);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle device selection
  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    onDeviceChange(deviceId);
  };

  // Listen for device changes
  useEffect(() => {
    loadDevices();
    
    // Set up device change listener
    wavRecorder.listenForDeviceChange((deviceList: any[]) => {
      const formattedDevices = deviceList.map((device: any) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 8)}...`,
        default: device.default
      }));
      setDevices(formattedDevices);
    });

    return () => {
      wavRecorder.listenForDeviceChange(null);
    };
  }, [wavRecorder]);

  if (isLoading) {
    return (
      <div className="microphone-selector">
        <div className="selector-label">Microphone:</div>
        <div className="selector-loading">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="microphone-selector">
      <div className="selector-label">Microphone:</div>
      <select
        className="device-select"
        value={selectedDeviceId}
        onChange={(e) => handleDeviceChange(e.target.value)}
        disabled={isConnected}
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label} {device.default ? '(Default)' : ''}
          </option>
        ))}
      </select>
      {isConnected && (
        <div className="selector-note">
          Disconnect to change microphone
        </div>
      )}
    </div>
  );
} 