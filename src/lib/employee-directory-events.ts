/** Send only an invalidation signal; each tab reads its own authenticated directory. */
export function employeeDirectoryChannel(demo: boolean) {
  return `rek-employee-directory:${demo ? "demo" : "office"}`;
}

export function notifyEmployeeDirectoryChanged(demo: boolean) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(employeeDirectoryChannel(demo));
  channel.postMessage("changed");
  channel.close();
}
