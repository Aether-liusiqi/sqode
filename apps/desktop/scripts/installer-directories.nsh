!include "LogicLib.nsh"

Var sqhFinalDirectory
Var sqhNewDirectory
Var sqhOldDirectory
Var sqhOldMoved
Var sqhNewMoved

!macro sqhExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\sqh-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call sqhRollbackDirectories
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !else
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    !endif
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro sqhStageApplication
  StrCpy $sqhFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $sqhNewDirectory "$INSTDIR.new-$0"
  StrCpy $sqhOldDirectory "$INSTDIR.old-$0"
  StrCpy $sqhOldMoved ""
  StrCpy $sqhNewMoved ""
  ClearErrors
  CreateDirectory $sqhNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\sqh-7za.exe "${SQODE_SEVENZIP_PATH}"
  StrCpy $INSTDIR $sqhNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  !ifdef SQODE_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${SQODE_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${SQODE_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $sqhFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call sqhCleanupDirectories
FunctionEnd

Function sqhCleanupDirectories
  ${If} $sqhFinalDirectory != ""
    Call sqhRollbackDirectories
  ${EndIf}
FunctionEnd

; Only directories created or renamed by this installer are removed during rollback.
Function sqhRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $sqhNewMoved == "1"
    RMDir /r "\\?\$sqhFinalDirectory"
    StrCpy $sqhNewMoved ""
  ${EndIf}
  ${If} $sqhOldMoved == "1"
    ClearErrors
    Rename $sqhOldDirectory $sqhFinalDirectory
    ${If} ${Errors}
      ; Leave the complete backup in place if another process prevents restoration.
      DetailPrint $sqhOldDirectory
      Return
    ${EndIf}
    StrCpy $sqhOldMoved ""
  ${EndIf}
  ${If} $sqhNewDirectory != ""
    RMDir /r "\\?\$sqhNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $sqhFinalDirectory
FunctionEnd

Function sqhPromoteDirectories
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 2
  !endif
  ; SetOutPath opens a directory handle; release it before either rename.
  SetOutPath $PLUGINSDIR
  ClearErrors
  ${If} ${FileExists} "$sqhFinalDirectory\*.*"
    Rename $sqhFinalDirectory $sqhOldDirectory
    ${If} ${Errors}
      Call sqhRollbackDirectories
      SetErrors
      Return
    ${EndIf}
    StrCpy $sqhOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    RMDir $sqhFinalDirectory
  ${EndIf}
  ClearErrors
  Rename $sqhNewDirectory $sqhFinalDirectory
  ${If} ${Errors}
    Call sqhRollbackDirectories
    SetErrors
    Return
  ${EndIf}
  StrCpy $sqhNewMoved "1"
  SetOutPath $sqhFinalDirectory
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 3
  !endif
  ClearErrors
FunctionEnd

!macro sqhFinishDirectories
  StrCpy $sqhNewMoved ""
  ${If} $sqhOldMoved == "1"
    RMDir /r "\\?\$sqhOldDirectory"
    StrCpy $sqhOldMoved ""
  ${EndIf}
!macroend
