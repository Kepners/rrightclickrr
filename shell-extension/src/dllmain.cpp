// RRightclickrr Windows 11 Shell Extension
// Implements IExplorerCommand for modern context menu integration

#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <strsafe.h>
#include <new>
#include "ExplorerCommand.h"

#pragma comment(lib, "shlwapi.lib")

// Global module instance
HMODULE g_hModule = nullptr;
long g_cDllRef = 0;

// GUIDs for our commands - MUST match AppxManifest.xml
// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6B} - Sync to Drive
// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6C} - Copy to Drive
// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6D} - Get Drive URL

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        g_hModule = hModule;
        DisableThreadLibraryCalls(hModule);
        break;
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}

// Class factory for creating command objects
class CClassFactory : public IClassFactory
{
public:
    CClassFactory(CommandType type) : m_cRef(1), m_type(type)
    {
        InterlockedIncrement(&g_cDllRef);
    }

    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void **ppv)
    {
        static const QITAB qit[] = {
            QITABENT(CClassFactory, IClassFactory),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }

    IFACEMETHODIMP_(ULONG) AddRef()
    {
        return InterlockedIncrement(&m_cRef);
    }

    IFACEMETHODIMP_(ULONG) Release()
    {
        long cRef = InterlockedDecrement(&m_cRef);
        if (cRef == 0)
        {
            delete this;
        }
        return cRef;
    }

    // IClassFactory
    IFACEMETHODIMP CreateInstance(IUnknown *pUnkOuter, REFIID riid, void **ppv)
    {
        if (pUnkOuter != nullptr)
            return CLASS_E_NOAGGREGATION;

        CExplorerCommand *pCommand = new (std::nothrow) CExplorerCommand(m_type);
        if (!pCommand)
            return E_OUTOFMEMORY;

        HRESULT hr = pCommand->QueryInterface(riid, ppv);
        pCommand->Release();
        return hr;
    }

    IFACEMETHODIMP LockServer(BOOL fLock)
    {
        if (fLock)
            InterlockedIncrement(&g_cDllRef);
        else
            InterlockedDecrement(&g_cDllRef);
        return S_OK;
    }

private:
    ~CClassFactory()
    {
        InterlockedDecrement(&g_cDllRef);
    }

    long m_cRef;
    CommandType m_type;
};

// CLSIDs
// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6A} - Root Menu (parent with subcommands)
static const CLSID CLSID_RootMenu =
{ 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6a } };

// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6B}
static const CLSID CLSID_SyncToDrive =
{ 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6b } };

// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6C}
static const CLSID CLSID_CopyToDrive =
{ 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6c } };

// {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6D}
static const CLSID CLSID_GetDriveURL =
{ 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6d } };

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void **ppv)
{
    *ppv = nullptr;

    CommandType type;
    if (IsEqualCLSID(rclsid, CLSID_RootMenu))
        type = CommandType::RootMenu;
    else if (IsEqualCLSID(rclsid, CLSID_SyncToDrive))
        type = CommandType::SyncToDrive;
    else if (IsEqualCLSID(rclsid, CLSID_CopyToDrive))
        type = CommandType::CopyToDrive;
    else if (IsEqualCLSID(rclsid, CLSID_GetDriveURL))
        type = CommandType::GetDriveURL;
    else
        return CLASS_E_CLASSNOTAVAILABLE;

    CClassFactory *pFactory = new (std::nothrow) CClassFactory(type);
    if (!pFactory)
        return E_OUTOFMEMORY;

    HRESULT hr = pFactory->QueryInterface(riid, ppv);
    pFactory->Release();
    return hr;
}

STDAPI DllCanUnloadNow()
{
    return g_cDllRef > 0 ? S_FALSE : S_OK;
}
