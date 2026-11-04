{
  # occt_native.node: src/*.cc (hand-written runtime) + src/generated/*.cc (gen.js), linked against the OpenCascade 7.6.3
  # import libraries from build-occt.ps1. OCCT_DIR overrides where that install is.
  "variables": {
    "occt_dir": "<!(node -p \"(process.env.OCCT_DIR || require('path').join(require('os').homedir(), 'Desktop', 'Output', 'Anvil Native', 'occt-7.6.3', 'install')).replace(/\\\\/g, '/')\")"
  },
  "targets": [
    {
      "target_name": "occt_native",
      "sources": [
        "src/addon.cc",
        "src/runtime.cc",
        "<!@(node -p \"require('fs').readdirSync('src/generated').filter(f => /\\.cc$/.test(f)).map(f => 'src/generated/' + f).join(' ')\")"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "<(occt_dir)/inc"
      ],
      "defines": [ "NAPI_CPP_EXCEPTIONS", "NODE_ADDON_API_DISABLE_DEPRECATED" ],
      "conditions": [
        [ "OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 2,
              "RuntimeTypeInfo": "true",
              "AdditionalOptions": [ "/std:c++17", "/bigobj", "/EHa", "/wd4996" ]
            },
            "VCLinkerTool": {
              "AdditionalLibraryDirectories": [ "<(occt_dir)/win64/vc14/lib" ]
            }
          },
          "libraries": [
            "TKernel.lib", "TKMath.lib", "TKG2d.lib", "TKG3d.lib", "TKGeomBase.lib", "TKBRep.lib",
            "TKGeomAlgo.lib", "TKTopAlgo.lib", "TKPrim.lib", "TKBO.lib", "TKBool.lib", "TKHLR.lib", "TKFillet.lib",
            "TKOffset.lib", "TKFeat.lib", "TKMesh.lib", "TKShHealing.lib",
            "TKXSBase.lib", "TKSTEPBase.lib", "TKSTEPAttr.lib", "TKSTEP209.lib", "TKSTEP.lib", "TKIGES.lib"
          ]
        } ]
      ]
    }
  ]
}
