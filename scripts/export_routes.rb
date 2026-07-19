# frozen_string_literal: true

class RouteExporter
  RouteInfo = Struct.new(
    :name,
    :path,
    :method,
    :controller,
    :action,
    :defaults,
    :constraints,
    :json_capable,
    keyword_init: true
  )

  def self.export
    Rails.application.routes.routes.filter_map do |route|
      reqs = route.requirements
      next unless reqs[:controller] && reqs[:action]

      verb = normalize_verb(route.verb)
      path = normalize_path(route.path.spec.to_s)

      RouteInfo.new(
        name: route.name,
        path: path,
        method: verb,
        controller: reqs[:controller],
        action: reqs[:action],
        defaults: route.defaults,
        constraints: extract_constraints(route),
        json_capable: json_capable?(reqs[:controller], reqs[:action])
      ).to_h
    end
  end

  # Whether `controller#action` actually has a `respond_to :json` (directly,
  # via the `responders` gem's `respond_to`/`mimes_for_respond_to`, not
  # inline `render json:`/`respond_to do |format| ... end` calls, which
  # aren't statically discoverable). Used to tell "not a JSON endpoint at
  # all" apart from "a JSON endpoint we just haven't documented yet".
  def self.json_capable?(controller, action)
    klass = "#{controller}_controller".classify.safe_constantize
    return false unless klass && klass.respond_to?(:mimes_for_respond_to)

    json = klass.mimes_for_respond_to[:json]
    return false unless json

    return true if json[:only].nil? && json[:except].nil?
    return json[:only].map(&:to_s).include?(action) if json[:only]

    !json[:except].map(&:to_s).include?(action)
  rescue StandardError
    # Some controller names (e.g. gem-provided dev/test-only ones like
    # view_components' own routes) don't resolve cleanly through
    # classify/const lookup. Not worth crashing the whole export over -
    # treat as not JSON-capable.
    false
  end

  def self.normalize_verb(verb)
    return nil if verb.nil?

    raw = verb.respond_to?(:source) ? verb.source.gsub(/[$^]/, "") : verb.to_s
    return "ANY" if raw.empty?

    raw
      .split("|")
      .map(&:strip)
      .reject(&:empty?)
      .join("|")
  end

  def self.normalize_path(path)
    path.sub(/\(\.:format\)$/, "")
  end

  def self.extract_constraints(route)
    route.constraints.each_with_object({}) do |(key, value), out|
      out[key] =
        case value
        when Regexp then value.source
        else value
        end
    end
  end
end
