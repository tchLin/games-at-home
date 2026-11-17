import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sounds } from './sound.js';
export function SoundControls() {
  const [enabled, setEnabled] = useState(() => sounds.isEnabled());
  return <button className="text-button sound-toggle" type="button" data-sound="off"
    aria-label={enabled ? 'Mute sounds' : 'Enable sounds'} aria-pressed={enabled}
    title={enabled ? 'Mute sounds' : 'Enable sounds'}
    onClick={() => {
      const next = !enabled;
      sounds.setEnabled(next);
      setEnabled(next);
      if (next) void sounds.unlock().then(() => sounds.play('tap'));
    }}>
    {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    <span>{enabled ? 'Sound on' : 'Sound off'}</span>
  </button>;
}
