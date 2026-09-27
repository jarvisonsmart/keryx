Pod::Spec.new do |s|
  s.name           = 'KeryxPush'
  s.version        = '1.0.0'
  s.summary        = 'Keryx wake-up transport: FCM topics over APNs with native wake-up verification'
  s.description    = 'Verifies Keryx wake-up envelopes natively, queues them for the JS layer and shows the generic notice.'
  s.author         = 'Keryx'
  s.license        = 'GPL-3.0-only'
  s.homepage       = 'https://github.com/v1b3coder/keryx'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'FirebaseMessaging'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.swift'
end
