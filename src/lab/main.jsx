// styles.css first, so the takes' own CSS (imported by LabApp) lands after it,
// in the order it would have once promoted into styles.css.
import '../styles.css';
import './lab.css';
import { createRoot } from 'react-dom/client';
import LabApp from './LabApp.jsx';

createRoot(document.getElementById('lab-root')).render(<LabApp />);
