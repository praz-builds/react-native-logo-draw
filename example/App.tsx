import React, { useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LogoDraw, type LogoDrawHandle } from 'react-native-logo-draw';
import { Chevron, Monogram, Ring, Spark } from './marks';

const INK = '#101014';
const ACCENT = '#E4572E';
const MUTED = '#6B6B76';

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>react-native-logo-draw</Text>
        <Text style={styles.subtitle}>
          A pen traces the outline, then ink floods it. Both halves are one
          gesture: the fill starts before the pen lands.
        </Text>

        <Demo
          title="The default"
          note="Four overlapping contours, unioned into one traceable outline."
        >
          <LogoDraw {...Monogram} size={120} color={INK} loop loopDelay={900} />
        </Demo>

        <Demo
          title="A counter that survives"
          note="The ring's hole is a second contour wound the other way."
        >
          <LogoDraw
            {...Ring}
            size={120}
            color={ACCENT}
            strokeWidth={2}
            loop
            loopDelay={900}
          />
        </Demo>

        <Demo
          title="Outline in one tone, ink in another"
          note="fillStart={40} — the ink is already spreading well before the pen lands."
        >
          <LogoDraw
            {...Spark}
            size={120}
            color={INK}
            fillColor={ACCENT}
            fillStart={40}
            duration={1600}
            loop
            loopDelay={900}
          />
        </Demo>

        <Tapable />

        <Text style={styles.footer}>
          Every path above was generated from ./marks/*.svg by the CLI in this
          repo. None of the numbers are hand-written.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The reason the component takes a ref: people trigger it on events. */
function Tapable() {
  const mark = useRef<LogoDrawHandle>(null);
  const [runs, setRuns] = useState(0);

  return (
    <Demo title="On demand" note="autoPlay={false}, driven through the ref.">
      <LogoDraw
        {...Chevron}
        ref={mark}
        size={120}
        color={INK}
        autoPlay={false}
        duration={900}
        onComplete={() => setRuns((n) => n + 1)}
        accessibilityLabel="Chevron"
      />
      <View style={styles.buttons}>
        <Button label="play()" onPress={() => mark.current?.play()} />
        <Button label="reset()" onPress={() => mark.current?.reset()} />
      </View>
      <Text style={styles.note}>completed {runs}x</Text>
    </Demo>
  );
}

function Demo({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.stage}>{children}</View>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 24, paddingBottom: 64, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: INK },
  subtitle: { fontSize: 15, lineHeight: 22, color: MUTED, marginBottom: 8 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#ECECE6',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: INK },
  stage: { alignItems: 'center', paddingVertical: 8 },
  note: { fontSize: 13, lineHeight: 19, color: MUTED },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: INK,
  },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  footer: { fontSize: 12, lineHeight: 18, color: MUTED, marginTop: 8 },
});
