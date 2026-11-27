require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RockVision'
  s.version        = package['version']
  s.summary        = 'Color camera frames and on-device rock features'
  s.description    = 'Reads the AR camera in color and describes frames for offline rock recognition.'
  s.license        = 'MIT'
  s.author         = 'Mountain Chicken'
  s.homepage       = 'https://github.com/DirtChicken/mountain-chicken-android'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/DirtChicken/mountain-chicken-android.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'UIKit', 'CoreGraphics', 'CoreVideo'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
