param([ValidateSet('status','volume','mute','mic','lock','sound')][string]$Action='status',[string]$Value='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
 int EnumAudioEndpoints(int flow,int mask,out IntPtr devices);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 int GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out IDevice device);
 int RegisterEndpointNotificationCallback(IntPtr client);int UnregisterEndpointNotificationCallback(IntPtr client);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
 [PreserveSig] int Activate(ref Guid id,int context,IntPtr args,[MarshalAs(UnmanagedType.IUnknown)]out object result);
 int OpenPropertyStore(int access,out IntPtr properties);
 int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);int GetState(out int state);
}
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEndpointVolume {
 int RegisterControlChangeNotify(IntPtr client);int UnregisterControlChangeNotify(IntPtr client);
 int GetChannelCount(out uint count);
 int SetMasterVolumeLevel(float level,ref Guid context);
 int SetMasterVolumeLevelScalar(float level,ref Guid context);
 int GetMasterVolumeLevel(out float level);int GetMasterVolumeLevelScalar(out float level);
 int SetChannelVolumeLevel(uint channel,float level,ref Guid context);
 int SetChannelVolumeLevelScalar(uint channel,float level,ref Guid context);
 int GetChannelVolumeLevel(uint channel,out float level);
 int GetChannelVolumeLevelScalar(uint channel,out float level);
 int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);
 int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
 int GetVolumeStepInfo(out uint step,out uint count);
 int VolumeStepUp(ref Guid context);int VolumeStepDown(ref Guid context);
 int QueryHardwareSupport(out uint mask);int GetVolumeRange(out float min,out float max,out float step);
}
public static class DeskPanelAudio {
 [DllImport("user32.dll",SetLastError=true)]public static extern bool LockWorkStation();
 static IEndpointVolume Open(bool mic) {
  var enumerator=(IDeviceEnumerator)new DeviceEnumerator();
  IDevice device=null;
  try {
   Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(mic?1:0,mic?2:1,out device));
   Guid iid=typeof(IEndpointVolume).GUID;object result;
   Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out result));
   return (IEndpointVolume)result;
  } finally {if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(enumerator);}
 }
 public static float Volume(){var endpoint=Open(false);try{float value;endpoint.GetMasterVolumeLevelScalar(out value);return value;}finally{Marshal.ReleaseComObject(endpoint);}}
 public static bool Muted(bool mic){var endpoint=Open(mic);try{bool value;endpoint.GetMute(out value);return value;}finally{Marshal.ReleaseComObject(endpoint);}}
 public static void SetVolume(int value){if(value<0||value>100)throw new ArgumentException();var endpoint=Open(false);try{Guid context=Guid.Empty;endpoint.SetMasterVolumeLevelScalar(value/100f,ref context);}finally{Marshal.ReleaseComObject(endpoint);}}
 public static void SetMuted(bool mic,bool value){var endpoint=Open(mic);try{Guid context=Guid.Empty;endpoint.SetMute(value,ref context);}finally{Marshal.ReleaseComObject(endpoint);}}
}
'@
try {
 if($Action -eq 'volume') { [DeskPanelAudio]::SetVolume([int]$Value) }
 if($Action -eq 'mute' -or $Action -eq 'mic') {
  if($Value -notin @('true','false')) {throw 'invalid'}
  [DeskPanelAudio]::SetMuted(($Action -eq 'mic'),($Value -eq 'true'))
 }
 if($Action -eq 'lock') {
  if(-not [DeskPanelAudio]::LockWorkStation()){throw 'lock_failed'}
 }
 if($Action -eq 'sound') {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName='ms-settings:sound';$info.UseShellExecute=$true
  [void][Diagnostics.Process]::Start($info)
 }
 $audio=$null;$mic=$null
 try {$audio=@{volume=[int][Math]::Round([DeskPanelAudio]::Volume()*100);muted=[DeskPanelAudio]::Muted($false)}} catch {}
 try {$mic=@{muted=[DeskPanelAudio]::Muted($true)}} catch {}
 @{connection='connected';audio=$audio;mic=$mic;accepted=$true}|ConvertTo-Json -Compress -Depth 3
} catch { [Console]::Write('{"connection":"unavailable","accepted":false}') }
