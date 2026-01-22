async function handleInput(text: string) {
  setIsThinking(true);

  const intent = detectIntent(text);

  if (intent.type !== 'CHAT') {
    execute(intent);
    speak("Yes Boss");
    setIsThinking(false);
    return;
  }

  const reply = think(`
  You are BUMBA.
  Speak briefly.
  Reply like a human assistant.
  ${text}
  `);

  await humanDelay(reply);
  speak(reply);

  setIsThinking(false);
}
