export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function outputFromTaskResponse(taskResponse) {
  const task = taskResponse?.task || null;
  const normalized = taskResponse?.normalized || {};
  return {
    task,
    normalized,
    status: task?.status || 'queued',
    progress: Number.isFinite(task?.progress) ? task.progress : 0
  };
}

export function statusText(status) {
  const map = {
    queued:    'Đang xếp hàng',
    running:   'Đang dựng model',
    success:   'Hoàn tất',
    failed:    'Thất bại',
    cancelled: 'Đã huỷ',
    banned:    'Bị chặn bởi policy',
    expired:   'Task hết hạn',
    unknown:   'Không rõ trạng thái'
  };
  return map[status] || status || 'Chưa chạy';
}

export function isCreditErrorMessage(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('enough credit') ||
    lower.includes('not enough') ||
    (message.includes('403') && lower.includes('credit'))
  );
}
