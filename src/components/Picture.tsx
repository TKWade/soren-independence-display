import type { PictureKind } from '../types/calendar'

/** Local vector placeholders keep pictures consistent and available offline. */
export function Picture({ kind }: { kind: PictureKind }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" aria-hidden="true" focusable="false">
      {kind === 'dinner' && <>
        <circle cx="60" cy="52" r="34" fill="#FFF9E9" stroke="#C39458" strokeWidth="5" />
        <circle cx="60" cy="52" r="23" fill="#EABC58" />
        <path d="M49 45q12-14 23 5M47 60q14-13 26 0" stroke="#C87850" strokeWidth="7" strokeLinecap="round" />
        <path d="M10 15v22m12-22v22M16 15v70M10 37h12M103 15v70m0-70q16 20 0 34" stroke="#618378" strokeWidth="5" strokeLinecap="round" />
      </>}
      {kind === 'sleep' && <>
        <path d="M14 48h92v33H14z" fill="#83A781" /><path d="M14 41v49m92-29v29" stroke="#618378" strokeWidth="7" strokeLinecap="round" />
        <rect x="20" y="42" width="27" height="17" rx="7" fill="#FFF8D9" />
        <path d="M49 45h50v30H49z" fill="#AFC6A0" />
        <path d="M72 6a15 15 0 1 0 19 19A16 16 0 0 1 72 6" fill="#DDA947" />
      </>}
      {kind === 'school' && <>
        <path d="M15 43h90v48H15z" fill="#F2BD55" /><path d="M9 44 60 10l51 34" fill="#DA7052" />
        <path d="M45 91V66a15 15 0 0 1 30 0v25" fill="#456C76" />
        <path d="M25 53h12v14H25zm58 0h12v14H83z" fill="#FFF6D6" />
        <circle cx="60" cy="36" r="10" fill="#FFF8E9" /><path d="M60 29v8h6" stroke="#456C76" strokeWidth="3" strokeLinecap="round" />
        <path d="M60 10V2h20l-5 5 5 5H62" fill="#527D6E" />
      </>}
      {kind === 'home' && <>
        <path d="M27 45h66v47H27z" fill="#E7B67F" /><path d="m15 48 45-37 45 37" fill="#618378" />
        <path d="M53 65h18v27H53z" fill="#8F654E" /><path d="M35 55h13v15H35zm42 0h10v15H77z" fill="#FFF8D9" />
        <circle cx="66" cy="80" r="2" fill="#FFDC81" /><path d="M94 7a13 13 0 1 0 16 17A14 14 0 0 1 94 7" fill="#DDA947" />
        <path d="M16 93h89" stroke="#618378" strokeWidth="4" strokeLinecap="round" />
      </>}
      {(kind === 'dad' || kind === 'mom') && <>
        {kind === 'mom' && <path d="M30 54V34a30 30 0 0 1 60 0v36H30z" fill="#805740" />}
        <path d="M19 99v-9a41 31 0 0 1 82 0v9" fill={kind === 'dad' ? '#6287AE' : '#C68488'} />
        <path d="M51 62h18v18H51z" fill="#E5AC80" />
        <ellipse cx="60" cy="40" rx="25" ry="29" fill="#F3C79E" />
        {kind === 'dad' ? <path d="M35 36V24C35 0 83-1 85 25v12L75 24c-11 8-27 4-31 1z" fill="#6C5040" />
          : <path d="M33 37c-3-44 57-45 54 3-17-6-22-17-22-17s-11 15-32 14" fill="#805740" />}
        <circle cx="50" cy="42" r="2.5" fill="#483C35" /><circle cx="70" cy="42" r="2.5" fill="#483C35" />
        <path d="M52 55q8 7 16 0" stroke="#AD6654" strokeWidth="3" strokeLinecap="round" />
      </>}
      {kind === 'swim' && <>
        <circle cx="78" cy="32" r="14" fill="#F3C79E" /><path d="M65 29c0-20 30-18 28 2" fill="#D98758" />
        <path d="m26 59 26-16 19 11-17 17M50 45 34 28 14 39" stroke="#E7AE82" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 72q13-12 26 0t26 0 26 0 26 0M9 88q13-12 26 0t26 0 26 0 26 0" stroke="#5A9DAE" strokeWidth="7" strokeLinecap="round" />
        <path d="M78 30h13" stroke="#4B7180" strokeWidth="5" strokeLinecap="round" />
      </>}
      {kind === 'park' && <>
        <circle cx="94" cy="18" r="12" fill="#EABC58" /><path d="M34 50v42" stroke="#96714F" strokeWidth="10" />
        <circle cx="34" cy="29" r="22" fill="#83A781" /><circle cx="21" cy="47" r="18" fill="#83A781" /><circle cx="46" cy="46" r="19" fill="#83A781" />
        <path d="M68 91V68h32v23M64 64h40M66 74h36" stroke="#B78357" strokeWidth="6" strokeLinecap="round" />
        <path d="M10 94h101" stroke="#83A781" strokeWidth="5" strokeLinecap="round" />
      </>}
    </svg>
  )
}
