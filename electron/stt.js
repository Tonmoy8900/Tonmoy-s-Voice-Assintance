const vosk = require('vosk');
const mic = require('mic');
const MODEL_PATH = './models/vosk-en';

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);

module.exports.startSTT = (onText) => {
  const recognizer = new vosk.Recognizer({ model, sampleRate: 16000 });

  const microphone = mic({
    rate: '16000',
    channels: '1',
    device: 'default'
  });

  microphone.getAudioStream().on('data', data => {
    if (recognizer.acceptWaveform(data)) {
      const res = recognizer.result();
      if (res.text) onText(res.text);
    }
  });

  microphone.start();
};
