"use client";
import { useEffect } from "react";
export default function DemoModal({title,message,confirmText="확인",onClose,onConfirm}:{title:string;message:string;confirmText?:string;onClose:()=>void;onConfirm?:()=>void}){
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[onClose]);
  return <div className="modal-screen" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div role="dialog" aria-modal="true" aria-label={title} className="modal-content">
    <h2>{title}</h2><p className="modal-message">{message}</p>
    <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button><button type="button" className="btn btn-orange" onClick={onConfirm??onClose}>{confirmText}</button></div>
  </div></div>;
}
