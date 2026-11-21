"use client";
import { useEffect, useRef, type ReactNode } from "react";

type Props={
  title:string; message?:string; children?:ReactNode;
  primaryLabel?:string; secondaryLabel?:string;
  onPrimary?:()=>void; onClose:()=>void;
  dismissible?:boolean; primaryDisabled?:boolean; kind?:"normal"|"wide"; accent?:"orange"|"purple";
};
/** Figma의 중앙 정렬, 흰 카드, 주황 확인 버튼을 사용한 공통 다이얼로그. */
export default function JobitdaModal({title,message,children,primaryLabel="닫기",secondaryLabel,onPrimary,onClose,dismissible=true,primaryDisabled=false,kind="normal",accent="orange"}:Props){
  const focusRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previouslyFocused=document.activeElement as HTMLElement | null;
    if(primaryDisabled)dialogRef.current?.focus();
    else focusRef.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape" && dismissible)onClose();};
    document.addEventListener("keydown",key);
    const prior=document.body.style.overflow; document.body.style.overflow="hidden";
    return ()=>{document.removeEventListener("keydown",key);document.body.style.overflow=prior;previouslyFocused?.focus?.();};
  },[onClose,dismissible,primaryDisabled]);
  return <div className="modal-screen" onMouseDown={e=>{if(dismissible&&e.target===e.currentTarget)onClose();}}>
    <section ref={dialogRef} tabIndex={-1} className={`modal-content ${kind==="wide"?"modal-wide":""}`} role="dialog" aria-modal="true" aria-label={title} aria-busy={primaryDisabled}>
      <h2>{title}</h2>
      {message&&<p className="modal-message">{message}</p>}
      {children}
      <div className="modal-actions">
        {secondaryLabel&&<button type="button" className={`btn ${accent==="purple"?"btn-outline-purple":"btn-outline-orange"}`} onClick={onClose}>{secondaryLabel}</button>}
        <button ref={focusRef} type="button" className={`btn ${accent==="purple"?"btn-purple":"btn-orange"}`} onClick={onPrimary??onClose} disabled={primaryDisabled}>{primaryLabel}</button>
      </div>
    </section>
  </div>;
}
