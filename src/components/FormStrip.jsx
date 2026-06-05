const LABELS = { W: 'V', D: 'N', L: 'D' };
const CLASSES = { W: 'form-w', D: 'form-d', L: 'form-l' };

export default function FormStrip({ form, size = 'md' }) {
  return (
    <div className={`form-strip form-strip-${size}`}>
      {form.map((r, i) => (
        <span key={i} className={`form-dot ${CLASSES[r]}`}>
          {LABELS[r]}
        </span>
      ))}
    </div>
  );
}
