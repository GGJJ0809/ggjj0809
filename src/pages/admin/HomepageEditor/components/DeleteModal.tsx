import { useState } from "react";

interface DeleteModalProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteModal({ title, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <i className="ri-error-warning-line text-red-500 text-lg"></i>
          </div>
          <h3 className="text-sm font-semibold text-foreground-900">确定删除？</h3>
        </div>
        <p className="text-xs text-foreground-500 mb-5 pl-13">删除后不可恢复，是否确认删除「{title}」组件？</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-medium text-foreground-600 hover:bg-background-100 transition-colors whitespace-nowrap">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors whitespace-nowrap">确定</button>
        </div>
      </div>
    </div>
  );
}