import { it, expect, vi, describe, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomTools from './RoomTools';

describe('RoomTools video and microphone toggle symbols and state', () => {
  let mockSocket: any;
  let audioTrack: { enabled: boolean; stop: any };
  let videoTrack: { enabled: boolean; stop: any };
  let mockStream: any;

  beforeEach(() => {
    const listeners: Record<string, Function[]> = {};
    mockSocket = {
      connected: true,
      emit: vi.fn(),
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      off: vi.fn((event: string, cb: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== cb);
        }
      }),
      trigger: (event: string, data: any) => {
        (listeners[event] || []).forEach((cb) => cb(data));
      },
      timeout: vi.fn().mockReturnThis(),
    };

    audioTrack = { enabled: true, stop: vi.fn() };
    videoTrack = { enabled: true, stop: vi.fn() };
    mockStream = {
      getTracks: vi.fn(() => [audioTrack, videoTrack]),
      getAudioTracks: vi.fn(() => [audioTrack]),
      getVideoTracks: vi.fn(() => [videoTrack]),
    };

    // Mock getUserMedia
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    // Mock RTCPeerConnection
    globalThis.RTCPeerConnection = vi.fn().mockImplementation(() => ({
      addTrack: vi.fn(),
      close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test' }),
      createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'test' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
    })) as any;
  });

  it('renders video tab with camera and microphone inactive by default', async () => {
    const user = userEvent.setup();
    render(<RoomTools socket={mockSocket} />);

    // Switch to video tab
    const videoTab = screen.getByRole('button', { name: /^video$/i });
    await user.click(videoTab);

    // Should indicate inactive status and OFF states
    expect(screen.getByText('Camera and microphone are off.')).toBeInTheDocument();
    expect(screen.getByText('Camera is Inactive')).toBeInTheDocument();
    expect(screen.getByText('Mic Off')).toBeInTheDocument();
    expect(screen.getByText('Cam Off')).toBeInTheDocument();
  });
  it('shows video controls immediately for an interviewer', () => {
    render(<RoomTools socket={mockSocket} interviewer />);
    expect(screen.getByRole('button', { name: /start video call/i })).toBeVisible();
  });
  it('reveals an incoming call while the candidate is on the chat tab', async () => {
    render(<RoomTools socket={mockSocket} />);
    mockSocket.trigger('RTC_SIGNAL', { type: 'offer', data: { type: 'offer', sdp: 'incoming-offer' } });
    expect(await screen.findByRole('button', { name: /accept video call/i })).toBeVisible();
  });
  it('resends a pending video offer when the other participant joins later', async () => {
    render(<RoomTools socket={mockSocket} interviewer />);
    await userEvent.setup().click(screen.getByRole('button', { name: /start video call/i }));
    await screen.findByRole('button', { name: /leave call/i });
    const rtc = vi.mocked(globalThis.RTCPeerConnection).mock.results[0].value;
    rtc.localDescription = { type: 'offer', sdp: 'pending-offer' };
    rtc.remoteDescription = null;
    mockSocket.trigger('CANDIDATE_JOINED', {});
    expect(mockSocket.emit).toHaveBeenCalledWith('RTC_SIGNAL', { type: 'offer', data: { type: 'offer', sdp: 'pending-offer' } });
  });

  it('updates symbols and emits media-state when starting call and toggling microphone and camera', async () => {
    const user = userEvent.setup();
    render(<RoomTools socket={mockSocket} interviewer />);

    // Switch to video tab
    await user.click(screen.getByRole('button', { name: /^video$/i }));

    // Start video call
    const startButton = screen.getByRole('button', { name: /start video call/i });
    await user.click(startButton);

    // Wait for active call indicators to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leave call/i })).toBeInTheDocument();
    });

    // Both microphone and camera should now display ON symbols
    const micButton = screen.getByRole('button', { name: /^turn off microphone$/i });
    const camButton = screen.getByRole('button', { name: /^turn off camera$/i });

    expect(micButton).toBeInTheDocument();
    expect(camButton).toBeInTheDocument();
    expect(micButton).toHaveTextContent(/Microphone:\s*ON/i);
    expect(camButton).toHaveTextContent(/Camera:\s*ON/i);

    // Toggle microphone to OFF
    await user.click(micButton);
    expect(audioTrack.enabled).toBe(false);
    expect(screen.getByRole('button', { name: /^turn on microphone$/i })).toHaveTextContent(/Microphone:\s*OFF/i);

    // Check that socket emitted RTC_SIGNAL with media-state
    expect(mockSocket.emit).toHaveBeenCalledWith('RTC_SIGNAL', {
      type: 'media-state',
      data: { mic: false, camera: true },
    });

    // Toggle camera to OFF
    await user.click(camButton);
    expect(videoTrack.enabled).toBe(false);
    expect(screen.getByRole('button', { name: /^turn on camera$/i })).toHaveTextContent(/Camera:\s*OFF/i);
    expect(screen.getByText('Your Camera is OFF')).toBeInTheDocument();

    expect(mockSocket.emit).toHaveBeenCalledWith('RTC_SIGNAL', {
      type: 'media-state',
      data: { mic: false, camera: false },
    });

    // Toggle microphone back ON
    const unmuteMicButton = screen.getByRole('button', { name: /^turn on microphone$/i });
    await user.click(unmuteMicButton);
    expect(audioTrack.enabled).toBe(true);
    expect(screen.getByRole('button', { name: /^turn off microphone$/i })).toHaveTextContent(/Microphone:\s*ON/i);
  });

  it('reflects participant media-state when received via socket', async () => {
    const user = userEvent.setup();
    render(<RoomTools socket={mockSocket} />);

    await user.click(screen.getByRole('button', { name: /^video$/i }));
    await user.click(screen.getByRole('button', { name: /start video call/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leave call/i })).toBeInTheDocument();
    });

    // Simulate remote peer turning camera off
    mockSocket.trigger('RTC_SIGNAL', {
      type: 'media-state',
      data: { mic: true, camera: false },
    });

    await waitFor(() => {
      expect(screen.getByText('Participant turned camera OFF')).toBeInTheDocument();
    });
  });
});
