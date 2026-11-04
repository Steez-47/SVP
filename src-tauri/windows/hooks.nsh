; SVP · Windows shell integration (Tauri NSIS hooks).
; Registers one ProgID (SVP.Video) for every video type, adds SVP to each type's "Open with" list and
; registers Capabilities so SVP appears in Settings > Apps > Default apps, where you can make it the
; default for all video types at once. Never overwrites another app's default. SHCTX = HKCU (per-user install).
; Updates run the old uninstaller with /UPDATE; registrations are kept then so default-app choices survive.

!define SVP_PROGID "SVP.Video"
!define SVP_CAPS "Software\SVP\Capabilities"

!macro SVP_REG EXT
  WriteRegStr SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${SVP_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${EXT}" ""
  WriteRegStr SHCTX "${SVP_CAPS}\FileAssociations" "${EXT}" "${SVP_PROGID}"
!macroend

!macro SVP_UNREG EXT
  DeleteRegValue SHCTX "Software\Classes\${EXT}\OpenWithProgids" "${SVP_PROGID}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; ProgID used for every video type
  WriteRegStr SHCTX "Software\Classes\${SVP_PROGID}" "" "Video"
  WriteRegStr SHCTX "Software\Classes\${SVP_PROGID}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\Classes\${SVP_PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${SVP_PROGID}\shell\open" "" "Play with SVP"
  WriteRegStr SHCTX "Software\Classes\${SVP_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  ; Application entry: name and icon in "Open with" / "Choose another app"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "SVP"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  ; Capabilities → Settings > Default apps
  WriteRegStr SHCTX "${SVP_CAPS}" "ApplicationName" "SVP"
  WriteRegStr SHCTX "${SVP_CAPS}" "ApplicationDescription" "Steez Video Player. Plays every format, with instant frame stepping, lossless trim and compression."
  WriteRegStr SHCTX "${SVP_CAPS}" "ApplicationIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\RegisteredApplications" "SVP" "${SVP_CAPS}"
  !insertmacro SVP_REG ".mp4"
  !insertmacro SVP_REG ".m4v"
  !insertmacro SVP_REG ".mkv"
  !insertmacro SVP_REG ".mov"
  !insertmacro SVP_REG ".webm"
  !insertmacro SVP_REG ".avi"
  !insertmacro SVP_REG ".wmv"
  !insertmacro SVP_REG ".asf"
  !insertmacro SVP_REG ".flv"
  !insertmacro SVP_REG ".f4v"
  !insertmacro SVP_REG ".ts"
  !insertmacro SVP_REG ".m2ts"
  !insertmacro SVP_REG ".mts"
  !insertmacro SVP_REG ".m2t"
  !insertmacro SVP_REG ".mpg"
  !insertmacro SVP_REG ".mpeg"
  !insertmacro SVP_REG ".mpe"
  !insertmacro SVP_REG ".m2v"
  !insertmacro SVP_REG ".vob"
  !insertmacro SVP_REG ".ogv"
  !insertmacro SVP_REG ".ogm"
  !insertmacro SVP_REG ".3gp"
  !insertmacro SVP_REG ".3g2"
  !insertmacro SVP_REG ".mxf"
  !insertmacro SVP_REG ".dv"
  !insertmacro SVP_REG ".divx"
  !insertmacro SVP_REG ".rm"
  !insertmacro SVP_REG ".rmvb"
  !insertmacro SVP_REG ".y4m"
  !insertmacro SVP_REG ".ivf"
  !insertmacro SVP_REG ".nut"
  !insertmacro SVP_REG ".hevc"
  !insertmacro SVP_REG ".h265"
  !insertmacro SVP_REG ".265"
  !insertmacro SVP_REG ".h264"
  !insertmacro SVP_REG ".264"
  !insertmacro SVP_REG ".av1"
  !insertmacro SVP_REG ".obu"
  ; tell Explorer associations changed (SHCNE_ASSOCCHANGED)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro SVP_UNREG ".mp4"
    !insertmacro SVP_UNREG ".m4v"
    !insertmacro SVP_UNREG ".mkv"
    !insertmacro SVP_UNREG ".mov"
    !insertmacro SVP_UNREG ".webm"
    !insertmacro SVP_UNREG ".avi"
    !insertmacro SVP_UNREG ".wmv"
    !insertmacro SVP_UNREG ".asf"
    !insertmacro SVP_UNREG ".flv"
    !insertmacro SVP_UNREG ".f4v"
    !insertmacro SVP_UNREG ".ts"
    !insertmacro SVP_UNREG ".m2ts"
    !insertmacro SVP_UNREG ".mts"
    !insertmacro SVP_UNREG ".m2t"
    !insertmacro SVP_UNREG ".mpg"
    !insertmacro SVP_UNREG ".mpeg"
    !insertmacro SVP_UNREG ".mpe"
    !insertmacro SVP_UNREG ".m2v"
    !insertmacro SVP_UNREG ".vob"
    !insertmacro SVP_UNREG ".ogv"
    !insertmacro SVP_UNREG ".ogm"
    !insertmacro SVP_UNREG ".3gp"
    !insertmacro SVP_UNREG ".3g2"
    !insertmacro SVP_UNREG ".mxf"
    !insertmacro SVP_UNREG ".dv"
    !insertmacro SVP_UNREG ".divx"
    !insertmacro SVP_UNREG ".rm"
    !insertmacro SVP_UNREG ".rmvb"
    !insertmacro SVP_UNREG ".y4m"
    !insertmacro SVP_UNREG ".ivf"
    !insertmacro SVP_UNREG ".nut"
    !insertmacro SVP_UNREG ".hevc"
    !insertmacro SVP_UNREG ".h265"
    !insertmacro SVP_UNREG ".265"
    !insertmacro SVP_UNREG ".h264"
    !insertmacro SVP_UNREG ".264"
    !insertmacro SVP_UNREG ".av1"
    !insertmacro SVP_UNREG ".obu"
    DeleteRegKey SHCTX "Software\Classes\${SVP_PROGID}"
    DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
    DeleteRegKey SHCTX "Software\SVP"
    DeleteRegValue SHCTX "Software\RegisteredApplications" "SVP"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
